"use strict";
// No network: real SDK request capture, pinned upstream source checks and isolated RLS.
// Request capture is NOT a live native Auth acceptance/bypass test.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const evidence=JSON.parse(read('docs/native-otp-audit/readonly-evidence.json'));
const settings=JSON.parse(read('docs/native-otp-audit/manually-confirmed-settings.json'));
const {createClient}=require('../migration/phase2/runtime/node_modules/@supabase/supabase-js');
const {PGlite}=require('./profile-audit/node_modules/@electric-sql/pglite');
const results=[];
const check=(name,value)=>{assert.ok(value,name);results.push({name,passed:true});};
const source=name=>read('docs/native-otp-audit/source/'+name.replaceAll('/','__'));
async function main(){
  check('Hosted health matches pinned upstream version',evidence.health.body.version===evidence.upstreamVersion && evidence.upstreamVersion==='v2.197.0');
  for(const s of evidence.upstreamSources) check('Pinned source integrity: '+s.file,crypto.createHash('sha256').update(read(s.local)).digest('hex')===s.sha256);
  check('Eight digits manually confirmed',settings.emailOtpLength===8);
  check('Native mailer accepts configurable length including eight',/config.Mailer.OtpLength < 6 \|\| config.Mailer.OtpLength > 10/.test(source('internal/conf/configuration.go')));
  check('Native OTP generator uses cryptographic randomness and left padding',/rand.Int\(r,/.test(source('internal/crypto/crypto.go')) && /strconv.Itoa\(digits\)/.test(source('internal/crypto/crypto.go')));
  const nativeUser=source('internal/api/user.go');
  const tokenSource=source('internal/api/token.go');
  check('Native password grant accepts credentials and issues tokens without device OTP input',/type PasswordGrantParams struct/.test(tokenSource)&&/Password string/.test(tokenSource)&&/models.PasswordGrant/.test(tokenSource));
  check('Native secure password change has a 24-hour recent-session exception',/now.After\(session.CreatedAt.Add\(24\*time.Hour\)\)/.test(nativeUser));
  check('Current password is a distinct control with recovery exemption',/UpdatePasswordRequireCurrentPassword/.test(nativeUser)&&/!session.IsRecovery\(\)/.test(nativeUser));
  check('Upstream native test identifies OTP sessions as exempt from current password',/Current password not required in OTP recovery flow/.test(source('internal/api/user_test.go')));
  check('Native AAL2 only applies when MFA enrolled',/user.HasMFAEnabled\(\) && !session.IsAAL2\(\)/.test(nativeUser));
  const verify=source('internal/api/verify.go');
  check('Native secure email change requires separate confirmation state',/SecureEmailChangeEnabled/.test(verify)&&/EmailChangeConfirmStatus == zeroConfirmation/.test(verify)&&/EmailChangeConfirmStatus = singleConfirmation/.test(verify));
  check('Native email change consumes proof for the confirmed address',/EmailChangeTokenCurrent = ""/.test(verify)&&/EmailChangeTokenNew = ""/.test(verify));
  check('Active normal password update passes current password after native verification',read('auth-service.js').includes('attributes.current_password = currentPassword') && read('auth-service.js').includes('password: currentPassword'));
  const id='11111111-1111-4111-8111-111111111111',email='synthetic@example.invalid';
  const user={id,email,aud:'authenticated',role:'authenticated',email_confirmed_at:'2026-01-01T00:00:00Z',user_metadata:{},app_metadata:{},created_at:'2026-01-01T00:00:00Z'};
  const jwt=Buffer.from('{}').toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:id,exp:Math.floor(Date.now()/1000)+3600,session_id:'22222222-2222-4222-8222-222222222222'})).toString('base64url')+'.synthetic';
  const requests=[];
  const capture=async(input,init={})=>{
    const u=new URL(input),body=init.body?JSON.parse(init.body):{};
    requests.push({method:init.method,path:u.pathname,grant:u.searchParams.get('grant_type'),keys:Object.keys(body),body});
    if(u.hostname!=='audit.example.invalid') throw Error('Network boundary violation');
    if(u.pathname.endsWith('/token')) return new Response(JSON.stringify({access_token:jwt,refresh_token:'synthetic-refresh',token_type:'bearer',expires_in:3600,user}),{status:200,headers:{'content-type':'application/json'}});
    if(init.method==='GET'&&u.pathname.endsWith('/user')) return new Response(JSON.stringify(user),{status:200,headers:{'content-type':'application/json'}});
    return new Response(JSON.stringify({error_code:'audit_capture_only',msg:'Request captured; native server not contacted'}),{status:418,headers:{'content-type':'application/json'}});
  };
  const c=createClient('https://audit.example.invalid','synthetic-key',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:capture}});
  await c.auth.signInWithPassword({email,password:'SyntheticPassword123!'});
  check('SDK can request password grant directly without OTP or device proof',requests[0].path==='/auth/v1/token'&&requests[0].grant==='password'&&!('token' in requests[0].body)&&!('device' in requests[0].body));
  await c.auth.updateUser({password:'SyntheticChangedPassword456!',current_password:'SyntheticPassword123!'});
  const update=requests.findLast(r=>r.method==='PUT');
  check('Direct SDK password-update request bypasses frontend and contains no OTP nonce',update.path==='/auth/v1/user'&&update.body.current_password&&!('nonce' in update.body));
  check('SDK performs no automatic reauthentication before direct update',!requests.some(r=>r.path.endsWith('/reauthenticate')));
  await c.auth.verifyOtp({email,token:'01234567',type:'email'});
  check('SDK preserves leading zero in native eight-digit verification request',requests.at(-1).path==='/auth/v1/verify'&&requests.at(-1).body.token==='01234567');
  await c.auth.verifyOtp({email,token:'01234567',type:'recovery'});
  check('SDK supports native recovery OTP type',requests.at(-1).body.type==='recovery');
  await c.auth.verifyOtp({email,token:'01234567',type:'email_change'});
  check('SDK supports native email-change OTP type',requests.at(-1).body.type==='email_change');
  const db=new PGlite();
  try{
    await db.exec(`create role anon nologin nobypassrls; create role authenticated nologin nobypassrls; create role supabase_auth_admin nologin; create schema auth; grant usage on schema public,auth to authenticated; create table auth.users(id uuid primary key,email_confirmed_at timestamptz,raw_user_meta_data jsonb,created_at timestamptz,is_anonymous boolean default false); create table auth.sessions(id uuid primary key,user_id uuid); create function auth.uid() returns uuid language sql stable set search_path='' as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;`);
    await db.exec(read('docs/phase43-production-profiles.sql'));
    await db.exec(`insert into auth.users values('${id}',now(),'{"full_name":"Synthetic User"}',now(),false); set role authenticated; set request.jwt.claim.sub='${id}'; set request.jwt.claim.session_id='22222222-2222-4222-8222-222222222222';`);
    check('Direct SQL access under deployed RLS allows confirmed owner without login OTP or live session', (await db.query('select id from public.profiles')).rows.length===1);
    check('Direct profile update does not require first-login or device-trust approval',(await db.query("update public.profiles set full_name='Changed Synthetic User' returning id")).rows.length===1);
    await db.exec("set request.jwt.claim.sub='33333333-3333-4333-8333-333333333333';");
    check('Existing profile ownership RLS still denies another user',(await db.query('select id from public.profiles')).rows.length===0);
  }finally{await db.close();c.auth.stopAutoRefresh();}
  const report={date:new Date().toISOString(),project:evidence.project,passed:results.length,failed:0,boundary:'No network. SDK HTTP capture does not demonstrate server acceptance. Real isolated PostgreSQL uses existing deployed profile SQL snapshot. Upstream checks inspect immutable official v2.197.0 source, not a running Auth server.',authenticatedHostedBypassTest:'Not performed: production mutations/accounts/emails forbidden; requires separately authorized isolated managed Supabase environment',results};
  fs.writeFileSync(path.join(root,'docs/native-otp-audit/test-results.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({passed:results.length,failed:0,boundary:report.boundary,authenticatedHostedBypassTest:report.authenticatedHostedBypassTest}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
