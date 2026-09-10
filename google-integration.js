const crypto = require('crypto');
const https = require('https');
const { URL, URLSearchParams } = require('url');

const SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/classroom.courses',
  'https://www.googleapis.com/auth/classroom.announcements',
  'https://www.googleapis.com/auth/classroom.coursework.me',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/meetings.space.created',
  'https://www.googleapis.com/auth/meetings.space.settings',
  'https://www.googleapis.com/auth/meetings.space.readonly',
  'https://www.googleapis.com/auth/youtube.upload'
];

const GOOGLE = {
  clientId: process.env.GOOGLE_CLIENT_ID || '',
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  redirectUri: process.env.GOOGLE_REDIRECT_URI || `http://localhost:${process.env.PORT || 3000}/api/google/oauth/callback`,
};

function configured(){ return !!(GOOGLE.clientId && GOOGLE.clientSecret); }
function stateToken(){ return crypto.randomBytes(24).toString('hex'); }
function authUrl(state){
  const p = new URLSearchParams({
    client_id: GOOGLE.clientId,
    redirect_uri: GOOGLE.redirectUri,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES.join(' '),
    state
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}
function tokenRequest(body){
  return new Promise((resolve,reject)=>{
    const data = new URLSearchParams(body).toString();
    const req = https.request({hostname:'oauth2.googleapis.com',path:'/token',method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Content-Length':Buffer.byteLength(data)}},r=>{
      let out=''; r.on('data',d=>out+=d); r.on('end',()=>{try{const j=JSON.parse(out); if(r.statusCode>=200&&r.statusCode<300)resolve(j); else reject(new Error(j.error_description||j.error||'Google token request failed'));}catch(e){reject(new Error('Invalid Google token response'));}});
    }); req.on('error',reject); req.write(data); req.end();
  });
}
async function exchangeCode(code){
  return tokenRequest({code,client_id:GOOGLE.clientId,client_secret:GOOGLE.clientSecret,redirect_uri:GOOGLE.redirectUri,grant_type:'authorization_code'});
}
async function refresh(refreshToken){
  return tokenRequest({refresh_token:refreshToken,client_id:GOOGLE.clientId,client_secret:GOOGLE.clientSecret,grant_type:'refresh_token'});
}
async function ensureAccess(db){
  const g=db.googleAuth;
  if(!configured()) throw new Error('Google integration is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.');
  if(!g?.refreshToken) throw new Error('Connect the official JME Google account first.');
  if(g.accessToken && Number(g.expiryDate||0) > Date.now()+120000) return g.accessToken;
  const t=await refresh(g.refreshToken);
  g.accessToken=t.access_token;
  g.expiryDate=Date.now()+Number(t.expires_in||3600)*1000;
  if(t.refresh_token)g.refreshToken=t.refresh_token;
  return g.accessToken;
}
async function googleFetch(db,url,options={}){
  let access=await ensureAccess(db);
  const headers={...(options.headers||{}),Authorization:`Bearer ${access}`};
  let r=await fetch(url,{...options,headers});
  if(r.status===401){
    db.googleAuth.expiryDate=0;
    access=await ensureAccess(db);
    r=await fetch(url,{...options,headers:{...(options.headers||{}),Authorization:`Bearer ${access}`}});
  }
  return r;
}
async function googleJson(db,url,options={}){
  const r=await googleFetch(db,url,options);
  const j=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(j.error?.message || j.error_description || `Google API error ${r.status}`);
  return j;
}
async function userInfo(db){return googleJson(db,'https://openidconnect.googleapis.com/v1/userinfo');}
async function createMeet(db,title,autoRecord=true,autoTranscript=true){
  return googleJson(db,'https://meet.googleapis.com/v2/spaces',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({config:{artifactConfig:{recordingConfig:{autoRecordingGeneration:autoRecord?'ON':'OFF'},transcriptionConfig:{autoTranscriptionGeneration:autoTranscript?'ON':'OFF'}}}})});
}
async function getMeetSpace(db,name){return googleJson(db,`https://meet.googleapis.com/v2/${name}`);}
async function findConference(db,spaceName){
  const q=encodeURIComponent(`space.name = "${spaceName}"`);
  const j=await googleJson(db,`https://meet.googleapis.com/v2/conferenceRecords?pageSize=100&filter=${q}`);
  return (j.conferenceRecords||[]).sort((a,b)=>new Date(b.startTime)-new Date(a.startTime))[0]||null;
}
async function listRecordings(db,conferenceName){
  const j=await googleJson(db,`https://meet.googleapis.com/v2/${conferenceName}/recordings?pageSize=100`);
  return j.recordings||[];
}
async function createClassroomCourse(db,course){
  return googleJson(db,'https://classroom.googleapis.com/v1/courses',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:course.title,section:'Judiciary Made Easy',description:course.description||'',ownerId:'me',courseState:'ACTIVE'})});
}
async function createAnnouncement(db,classroomCourseId,title,body){
  return googleJson(db,`https://classroom.googleapis.com/v1/courses/${encodeURIComponent(classroomCourseId)}/announcements`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:`${title}\n\n${body}`,state:'PUBLISHED'})});
}
async function listDrive(db,query=''){const q=query||`trashed = false`;return googleJson(db,`https://www.googleapis.com/drive/v3/files?pageSize=50&orderBy=modifiedTime%20desc&q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,size,webViewLink,createdTime,modifiedTime),nextPageToken`);}
async function driveStream(db,fileId,req,res){
  const headers={}; if(req.headers.range)headers.Range=req.headers.range;
  const r=await googleFetch(db,`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,{headers});
  if(!r.ok) throw new Error(`Drive file request failed: ${r.status}`);
  if(r.headers.get('content-type'))res.setHeader('Content-Type',r.headers.get('content-type'));
  if(r.headers.get('content-length'))res.setHeader('Content-Length',r.headers.get('content-length'));
  if(r.headers.get('content-range'))res.setHeader('Content-Range',r.headers.get('content-range'));
  res.setHeader('Accept-Ranges','bytes');
  res.status(r.status);
  if(r.body) require('stream').Readable.fromWeb(r.body).pipe(res); else res.end();
}

module.exports={GOOGLE,SCOPES,configured,stateToken,authUrl,exchangeCode,ensureAccess,googleFetch,googleJson,userInfo,createMeet,getMeetSpace,findConference,listRecordings,createClassroomCourse,createAnnouncement,listDrive,driveStream};
