"use strict";
// GET-only evidence collection. Never sends Auth email, logs in, or changes users/settings.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const ref = 'ffznkypurnocabqyxpps';
const config = fs.readFileSync(path.join(root,'supabase-client.js'),'utf8');
const key = config.match(/const key = "([^"]+)"/)[1];
async function get(url,headers={}) {
  const r = await fetch(url,{method:'GET',headers,redirect:'error',signal:AbortSignal.timeout(20000)});
  return {status:r.status,body:await r.json()};
}
async function main() {
  const report = {date:new Date().toISOString(),project:ref,methods:['GET'],customerAccountsAccessed:false,emailsSent:false};
  report.publicSettings=await get(`https://${ref}.supabase.co/auth/v1/settings`,{apikey:key});
  report.health=await get(`https://${ref}.supabase.co/auth/v1/health`,{apikey:key});
  report.unauthenticatedUser=await get(`https://${ref}.supabase.co/auth/v1/user`,{apikey:key});
  report.anonymousProfiles=await get(`https://${ref}.supabase.co/rest/v1/profiles?select=id&limit=0`,{apikey:key});
  // Save only explicitly non-secret fields; never serialize the management response.
  if(process.env.SUPABASE_ACCESS_TOKEN) {
    const result=await get(`https://api.supabase.com/v1/projects/${ref}/config/auth`,{Authorization:`Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`});
    const fields=['mailer_otp_length','mailer_otp_exp','mailer_autoconfirm','mailer_allow_unverified_email_sign_ins','mailer_secure_email_change_enabled','security_update_password_require_reauthentication','security_update_password_require_current_password','smtp_host','smtp_port','smtp_max_frequency','jwt_exp','disable_signup','external_email_enabled','external_google_enabled','hook_custom_access_token_enabled','hook_send_email_enabled','hook_password_verification_attempt_enabled','hook_mfa_verification_attempt_enabled','mfa_totp_enroll_enabled','mfa_totp_verify_enabled','mfa_phone_enroll_enabled','mfa_phone_verify_enabled'];
    report.managementConfig={status:result.status,values:Object.fromEntries(fields.filter(f=>f in result.body).map(f=>[f,result.body[f]]))};
  } else report.managementConfig={status:'unavailable',reason:'No management configuration tool, connected dashboard browser, or SUPABASE_ACCESS_TOKEN'};
  const version=report.health.body.version;
  if(!/^v\d+\.\d+\.\d+$/.test(version)) throw Error('Hosted version cannot be safely pinned');
  report.upstreamVersion=version;
  const commit=await get(`https://api.github.com/repos/supabase/auth/commits/${version}`,{'User-Agent':'Selcore-readonly-OTP-audit','Accept':'application/vnd.github+json'});
  if(commit.status!==200 || !/^[a-f0-9]{40}$/.test(commit.body.sha)) throw Error('Unable to pin upstream source');
  report.upstreamCommit=commit.body.sha;
  report.upstreamSources=[];
  const dest=path.join(root,'docs/native-otp-audit/source');fs.mkdirSync(dest,{recursive:true});
  for(const file of ['internal/api/user.go','internal/api/user_test.go','internal/api/token.go','internal/api/mail.go','internal/api/verify.go','internal/conf/configuration.go','internal/crypto/crypto.go','internal/mailer/mailer.go']) {
    const url=`https://raw.githubusercontent.com/supabase/auth/${report.upstreamCommit}/${file}`;
    const r=await fetch(url,{method:'GET',redirect:'error',signal:AbortSignal.timeout(20000)});
    if(!r.ok) throw Error('Source unavailable: '+file);
    const content=await r.text(), local=file.replaceAll('/','__');
    fs.writeFileSync(path.join(dest,local),content);
    report.upstreamSources.push({file,url,local:'docs/native-otp-audit/source/'+local,sha256:crypto.createHash('sha256').update(content).digest('hex')});
  }
  fs.writeFileSync(path.join(root,'docs/native-otp-audit/readonly-evidence.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({project:ref,publicSettings:report.publicSettings,health:report.health,unauthenticatedUser:report.unauthenticatedUser,anonymousProfiles:report.anonymousProfiles,managementConfig:report.managementConfig,upstreamCommit:report.upstreamCommit},null,2));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
