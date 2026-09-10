const express = require('express');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const crypto = require('crypto');
const https = require('https');
const { Pool } = require('pg');
const Google = require('./google-integration');
let S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, getSignedUrl;
try {
  ({ S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3'));
  ({ getSignedUrl } = require('@aws-sdk/s3-request-presigner'));
} catch (_) {}

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_THIS_SECRET_IN_PRODUCTION';
const DB_FILE = path.join(__dirname, 'data.json');
const pgPool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false } }) : null;
let pgState = null;
const UPLOAD_DIR = path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
app.use(express.json({ limit: '6mb', verify: (req, res, buf) => { req.rawBody = Buffer.from(buf); } }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

function seedDB() {
  const password = bcrypt.hashSync('admin123', 10);
  return {
    users: [{ id: 1, name: 'Pradeep Sir', email: 'admin@judiciarymadeeasy.in', password, role: 'admin' }],
    courses: [
      { id: 1, title: 'Bharatiya Nyaya Sanhita (BNS)', category: 'Criminal Law', tests: 6, lessons: 31, price: 11000, description: 'BNS concepts, sections and important Supreme Court judgments.' },
      { id: 2, title: 'Bharatiya Sakshya Adhiniyam (BSA)', category: 'Evidence', tests: 6, lessons: 26, price: 11000, description: 'Evidence law for Judiciary and AIBE preparation.' },
      { id: 3, title: 'Bharatiya Nagarik Suraksha Sanhita (BNSS)', category: 'Procedure', tests: 6, lessons: 34, price: 11000, description: 'Criminal procedure, investigation, bail and trial.' },
      { id: 4, title: 'Code of Civil Procedure (CPC)', category: 'Civil Law', tests: 5, lessons: 28, price: 9000, description: 'Core CPC concepts and exam-oriented problem solving.' },
      { id: 5, title: 'Transfer of Property Act (TPA)', category: 'Property', tests: 3, lessons: 20, price: 7000, description: 'Transfer of property concepts with illustrations.' },
      { id: 6, title: 'Contract / SOGA / Partnership', category: 'Commercial Law', tests: 6, lessons: 30, price: 9000, description: 'Commercial law package for competitive law examinations.' },
      { id: 7, title: 'Punjab Judiciary Complete Course', category: 'Punjab Judiciary', tests: 40, lessons: 100, price: 21000, description: 'Complete Punjab Judiciary preparation with lectures, tests, notes and mains answer writing.' }
    ],
    tests: [
      { id: 1, title: 'BNSS — FIR & Investigation', type: 'Weekly Test', questionCount: 10, duration: 15, marks: 10, courseId: 3 },
      { id: 2, title: 'Criminal Law Mains Paper 1', type: 'Mains Mock', questionCount: 5, duration: 90, marks: 100, courseId: 1 },
      { id: 3, title: 'Evidence Law — Rapid Revision', type: 'MCQ', questionCount: 10, duration: 10, marks: 10, courseId: 2 },
      { id: 4, title: 'Punjab Judiciary Mock Test 01', type: 'Full Mock', questionCount: 20, duration: 30, marks: 20, courseId: 7 }
    ],
    questions: [
      { id: 1, testId: 1, text: 'Under the new criminal procedure framework, an FIR primarily records information relating to a cognizable offence.', options: ['True', 'False', 'Only for bailable offences', 'Only after charge-sheet'], answer: 0, explanation: 'Demo question. Replace it with your verified question bank before launch.' },
      { id: 2, testId: 1, text: 'Which body is primarily responsible for investigating a cognizable offence?', options: ['Police', 'Civil Court', 'Revenue Court', 'Consumer Commission'], answer: 0, explanation: 'Demo question. Replace it with your verified question bank before launch.' },
      { id: 3, testId: 1, text: 'A charge-sheet is generally filed after completion of investigation.', options: ['True', 'False', 'Only in civil cases', 'Never'], answer: 0, explanation: 'Demo question. Replace it with your verified question bank before launch.' },
      { id: 4, testId: 1, text: 'The purpose of investigation is to collect and preserve evidence relating to the alleged offence.', options: ['True', 'False', 'Only to secure conviction', 'Only to secure bail'], answer: 0, explanation: 'Demo question. Replace it with your verified question bank before launch.' },
      { id: 5, testId: 1, text: 'A statement made during investigation is automatically substantive evidence in every circumstance.', options: ['True', 'False', 'Always', 'Only in civil cases'], answer: 1, explanation: 'Demo question. Replace it with your verified question bank before launch.' },
      { id: 6, testId: 1, text: 'A cognizable offence generally permits police action without a warrant subject to law.', options: ['True', 'False', 'Only with a civil decree', 'Only after conviction'], answer: 0, explanation: 'Demo question. Replace it with your verified question bank before launch.' },
      { id: 7, testId: 1, text: 'The investigation stage and trial stage are legally distinct stages of a criminal case.', options: ['True', 'False', 'They are identical', 'Only in appeals'], answer: 0, explanation: 'Demo question. Replace it with your verified question bank before launch.' },
      { id: 8, testId: 1, text: 'A police report is associated with the completion of investigation.', options: ['True', 'False', 'Only with civil suits', 'Only with mediation'], answer: 0, explanation: 'Demo question. Replace it with your verified question bank before launch.' },
      { id: 9, testId: 1, text: 'The presumption of innocence is a foundational principle of criminal justice.', options: ['True', 'False', 'Only for civil disputes', 'Only for appeals'], answer: 0, explanation: 'Demo question. Replace it with your verified question bank before launch.' },
      { id: 10, testId: 1, text: 'Evidence collection should be conducted in accordance with the governing law and procedure.', options: ['True', 'False', 'Never', 'Only after conviction'], answer: 0, explanation: 'Demo question. Replace it with your verified question bank before launch.' },
      { id: 11, testId: 3, text: 'Evidence law primarily deals with the proof of facts in legal proceedings.', options: ['True', 'False', 'Only taxation', 'Only contracts'], answer: 0, explanation: 'Demo question. Replace it with your verified BSA question bank.' },
      { id: 12, testId: 3, text: 'Relevance and admissibility are concepts used in determining whether evidence may be considered.', options: ['True', 'False', 'Only in arbitration', 'Only in family law'], answer: 0, explanation: 'Demo question. Replace it with your verified BSA question bank.' },
      { id: 13, testId: 3, text: 'A fact admitted by a party can have evidentiary significance.', options: ['True', 'False', 'Never', 'Only outside court'], answer: 0, explanation: 'Demo question. Replace it with your verified BSA question bank.' },
      { id: 14, testId: 3, text: 'The burden of proof concerns which party must establish a fact or proposition.', options: ['True', 'False', 'Only the judge', 'Only the police'], answer: 0, explanation: 'Demo question. Replace it with your verified BSA question bank.' },
      { id: 15, testId: 3, text: 'Oral evidence and documentary evidence are distinct categories of evidence.', options: ['True', 'False', 'Identical', 'Neither exists'], answer: 0, explanation: 'Demo question. Replace it with your verified BSA question bank.' },
      { id: 16, testId: 3, text: 'The court may consider evidentiary rules while determining whether a fact has been proved.', options: ['True', 'False', 'Never', 'Only in criminal appeals'], answer: 0, explanation: 'Demo question. Replace it with your verified BSA question bank.' },
      { id: 17, testId: 3, text: 'Cross-examination is a method of testing the testimony of a witness.', options: ['True', 'False', 'Only for documents', 'Only before police'], answer: 0, explanation: 'Demo question. Replace it with your verified BSA question bank.' },
      { id: 18, testId: 3, text: 'A relevant fact is necessarily admissible in every case without applying any other rule.', options: ['True', 'False', 'Always', 'Only in civil suits'], answer: 1, explanation: 'Demo question. Replace it with your verified BSA question bank.' },
      { id: 19, testId: 3, text: 'A court evaluates evidence in the context of the issues that arise in the proceeding.', options: ['True', 'False', 'Never', 'Only in mediation'], answer: 0, explanation: 'Demo question. Replace it with your verified BSA question bank.' },
      { id: 20, testId: 3, text: 'The credibility of a witness may be tested through legally permitted methods.', options: ['True', 'False', 'Never', 'Only outside court'], answer: 0, explanation: 'Demo question. Replace it with your verified BSA question bank.' }
    ],
    lessons: [], materials: [], announcements: [{ id: 1, title: 'Welcome to Judiciary Made Easy', body: 'Your complete judiciary preparation platform by Pradeep Sir.', createdAt: new Date().toISOString() }],
    submissions: [], results: [], attempts: [], enrollments: [], payments: [], googleAuth: {connected:false, accessToken:'', refreshToken:'', expiryDate:0, email:'', connectedAt:null}
  };
}
function loadDB() {
  if (pgPool) {
    if (!pgState) pgState = seedDB();
    return pgState;
  }
  if (!fs.existsSync(DB_FILE)) { const db = seedDB(); fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); return db; }
  const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  db.questions ||= []; db.attempts ||= []; db.enrollments ||= []; db.results ||= []; db.materials ||= []; db.announcements ||= []; db.submissions ||= []; db.lessons ||= []; db.payments ||= []; db.progress ||= []; db.liveClasses ||= []; db.liveMessages ||= []; db.liveAttendance ||= []; db.liveWebhookEvents ||= []; db.liveRecordings ||= [];
  db.courses.forEach(c => { if (c.price == null) c.price = 0; });
  db.googleAuth ||= {connected:false, accessToken:'', refreshToken:'', expiryDate:0, email:'', connectedAt:null};
  return db;
}
function saveDB(db) {
  if (pgPool) {
    pgState = db;
    pgPool.query('INSERT INTO jme_state (id, data, updated_at) VALUES (1, $1, NOW()) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()', [JSON.stringify(db)]).catch(err => console.error('PostgreSQL save failed:', err.message));
    return;
  }
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

async function initPersistence() {
  if (!pgPool) { loadDB(); return; }
  await pgPool.query('CREATE TABLE IF NOT EXISTS jme_state (id INTEGER PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
  const result = await pgPool.query('SELECT data FROM jme_state WHERE id = 1');
  if (result.rows.length) {
    pgState = result.rows[0].data;
    // Keep forward-compatible defaults for newly added collections.
    const defaults = seedDB();
    Object.keys(defaults).forEach(k => { if (pgState[k] == null) pgState[k] = defaults[k]; });
    saveDB(pgState);
  } else {
    pgState = seedDB();
    await pgPool.query('INSERT INTO jme_state (id, data) VALUES (1, $1)', [JSON.stringify(pgState)]);
  }
}

function tokenFor(user) { return jwt.sign({ id: user.id, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '7d' }); }
function auth(req, res, next) { const h = req.headers.authorization || ''; try { req.user = jwt.verify(h.startsWith('Bearer ') ? h.slice(7) : '', JWT_SECRET); next(); } catch { res.status(401).json({ error: 'Login required' }); } }
function admin(req, res, next) { if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' }); next(); }
function safeUser(u) { return { id: u.id, name: u.name, email: u.email, role: u.role }; }
function enrolled(db, userId, courseId) { return db.enrollments.some(e => e.userId === Number(userId) && e.courseId === Number(courseId) && e.status === 'active'); }
function publicQuestion(q) { return { id: q.id, testId: q.testId, text: q.text, options: q.options }; }
function testQuestions(db, testId) { return db.questions.filter(q => q.testId === Number(testId)).slice(0, 200); }
function coursePayload(db, c, userId) { const access = userId ? enrolled(db, userId, c.id) : false; return { ...c, enrolled: access, lessons: db.lessons.filter(l => l.courseId === c.id).sort((a,b)=>a.order-b.order).map(l => ({ id:l.id,title:l.title,description:l.description,chapter:l.chapter||'General',order:l.order,type:l.type,duration:l.duration,locked:!access })) }; }

const upload = multer({ dest: UPLOAD_DIR, limits: { fileSize: 500 * 1024 * 1024 } });

app.get('/api/health', (req,res) => res.json({ ok:true, app:'Judiciary Made Easy', version:'13.0.0', persistence:pgPool?'postgresql':'local-file', razorpayConfigured:!!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET), upiConfigured:!!process.env.JME_UPI_ID }));
app.post('/api/register', async (req,res)=>{ const {name,email,password}=req.body||{}; if(!name||!email||!password||password.length<6)return res.status(400).json({error:'Name, email and password (6+ chars) are required'}); const db=loadDB(); if(db.users.find(u=>u.email.toLowerCase()===email.toLowerCase()))return res.status(409).json({error:'Email already registered'}); const user={id:Date.now(),name,email:email.toLowerCase(),password:await bcrypt.hash(password,10),role:'student'};db.users.push(user);saveDB(db);res.json({token:tokenFor(user),user:safeUser(user)}); });
app.post('/api/login', async (req,res)=>{ const {email,password}=req.body||{};const db=loadDB();const user=db.users.find(u=>u.email.toLowerCase()===(email||'').toLowerCase());if(!user||!(await bcrypt.compare(password||'',user.password)))return res.status(401).json({error:'Invalid email or password'});res.json({token:tokenFor(user),user:safeUser(user)}); });
// Google Workspace Model A: one official JME Google account controls Meet, Classroom, Drive and YouTube.
let googleOAuthState='';
app.get('/api/admin/google/status',auth,admin,(req,res)=>{
  const db=loadDB();
  res.json({configured:Google.configured(),connected:!!db.googleAuth?.refreshToken,email:db.googleAuth?.email||'',scopes:Google.SCOPES});
});
app.post('/api/admin/google/connect',auth,admin,(req,res)=>{
  if(!Google.configured()) return res.status(503).json({error:'Google integration is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.'});
  googleOAuthState=Google.stateToken();
  res.json({url:Google.authUrl(googleOAuthState)});
});
app.get('/api/google/oauth/callback',async(req,res)=>{
  try{
    if(!req.query.state || req.query.state!==googleOAuthState) return res.status(400).send('Invalid Google OAuth state. Please start the connection again from JME.');
    googleOAuthState='';
    if(req.query.error) return res.status(400).send(`Google authorization was not completed: ${String(req.query.error)}`);
    const t=await Google.exchangeCode(String(req.query.code||''));
    if(!t.refresh_token) return res.status(400).send('Google did not return a refresh token. Reconnect and approve offline access.');
    const db=loadDB(); db.googleAuth={connected:true,accessToken:t.access_token||'',refreshToken:t.refresh_token,expiryDate:Date.now()+Number(t.expires_in||3600)*1000,email:'',connectedAt:new Date().toISOString()};
    try{const info=await Google.userInfo(db);db.googleAuth.email=info.email||'';}catch{}
    saveDB(db);
    res.redirect('/#google-connected');
  }catch(e){res.status(500).send(`Google connection failed: ${String(e.message||e)}`)}
});
app.post('/api/admin/google/disconnect',auth,admin,(req,res)=>{const db=loadDB();db.googleAuth={connected:false,accessToken:'',refreshToken:'',expiryDate:0,email:'',connectedAt:null};saveDB(db);res.json({ok:true});});
app.post('/api/admin/google/test',auth,admin,async(req,res)=>{try{const db=loadDB();const info=await Google.userInfo(db);res.json({ok:true,email:info.email||db.googleAuth.email||''});}catch(e){res.status(503).json({error:e.message})}});
app.post('/api/admin/course/:id/google-classroom',auth,admin,async(req,res)=>{try{const db=loadDB();const c=db.courses.find(v=>v.id===Number(req.params.id));if(!c)return res.status(404).json({error:'Course not found'});if(c.googleClassroomCourseId)return res.json(c);if(!db.googleAuth?.refreshToken)return res.status(400).json({error:'Connect the official JME Google account first.'});const gc=await Google.createClassroomCourse(db,c);c.googleClassroomCourseId=gc.id;c.googleClassroomUrl=gc.alternateLink||`https://classroom.google.com/c/${gc.id}`;saveDB(db);res.json(c);}catch(e){res.status(503).json({error:e.message})}});
app.post('/api/admin/announcement/:id/google-classroom',auth,admin,async(req,res)=>{try{const db=loadDB();const a=db.announcements.find(v=>v.id===Number(req.params.id));if(!a)return res.status(404).json({error:'Announcement not found'});const courseId=Number(req.body.courseId);const c=db.courses.find(v=>v.id===courseId);if(!c?.googleClassroomCourseId)return res.status(400).json({error:'Select a JME course that is linked to Google Classroom.'});const g=await Google.createAnnouncement(db,c.googleClassroomCourseId,a.title,a.body);a.googleClassroomAnnouncementId=g.id;saveDB(db);res.json({ok:true,id:g.id});}catch(e){res.status(503).json({error:e.message})}});

app.post('/api/admin/live/:id/google-meet',auth,admin,async(req,res)=>{try{const db=loadDB();const x=db.liveClasses.find(v=>v.id===Number(req.params.id));if(!x)return res.status(404).json({error:'Live class not found'});if(x.googleMeetingUri)return res.json(livePayload(db,x,req.user.id));if(!db.googleAuth?.refreshToken)return res.status(400).json({error:'Connect the official JME Google account first.'});const space=await Google.createMeet(db,x.title,true,true);x.provider='google';x.googleSpaceName=space.name;x.googleMeetingUri=space.meetingUri;x.googleMeetingCode=space.meetingCode;x.recordingStatus='google_auto_recording';saveDB(db);res.json(livePayload(db,x,req.user.id));}catch(e){res.status(503).json({error:e.message})}});
app.post('/api/admin/live/:id/google-sync',auth,admin,async(req,res)=>{try{const db=loadDB();const x=db.liveClasses.find(v=>v.id===Number(req.params.id));if(!x)return res.status(404).json({error:'Live class not found'});if(!x.googleSpaceName)return res.status(400).json({error:'This class does not have a Google Meet space yet.'});const conf=await Google.findConference(db,x.googleSpaceName);if(!conf)return res.status(404).json({error:'Google Meet conference record is not available yet. Wait a few minutes after the class ends.'});x.googleConferenceRecord=conf.name;const recs=await Google.listRecordings(db,conf.name);const ready=recs.find(r=>r.state==='FILE_GENERATED'&&r.driveDestination?.file);if(!ready)return res.status(202).json({ok:false,status:'processing',message:'Meet found the conference, but the recording file is not ready yet.'});const fileId=ready.driveDestination.file;let rec=db.liveRecordings.find(v=>v.classId===x.id&&v.storage==='google_drive');if(!rec){rec={id:Date.now(),classId:x.id,filename:`${x.title.replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'')||'live-class'}.mp4`,storage:'google_drive',driveFileId:fileId,driveUrl:ready.driveDestination.exportUri||`https://drive.google.com/file/d/${fileId}/view`,size:0,createdAt:new Date().toISOString(),duration:null};db.liveRecordings.push(rec);}else{rec.driveFileId=fileId;rec.driveUrl=ready.driveDestination.exportUri||rec.driveUrl;}x.recordingId=rec.id;x.recordingStatus='ready';x.recordingStorage='google_drive';x.recordingUrl=`/api/live/${x.id}/recording`;saveDB(db);res.json({...livePayload(db,x,req.user.id),recording:rec});}catch(e){res.status(503).json({error:e.message})}});

app.get('/api/dashboard',auth,(req,res)=>{const db=loadDB();res.json({user:{id:req.user.id,name:req.user.name,email:db.users.find(u=>u.id===req.user.id)?.email,role:req.user.role},courses:db.courses.map(c=>coursePayload(db,c,req.user.id)),tests:db.tests,materials:db.materials.map(m=>({...m,protected:true})),announcements:db.announcements.slice(-10).reverse(),results:db.results.filter(r=>r.userId===req.user.id),enrollments:db.enrollments.filter(e=>e.userId===req.user.id)});});
app.get('/api/courses',auth,(req,res)=>res.json(loadDB().courses.map(c=>coursePayload(loadDB(),c,req.user.id))));
app.get('/api/courses/:id',auth,(req,res)=>{const db=loadDB();const c=db.courses.find(x=>x.id===Number(req.params.id));if(!c)return res.status(404).json({error:'Course not found'});res.json(coursePayload(db,c,req.user.id));});
app.get('/api/me/courses',auth,(req,res)=>{const db=loadDB();res.json(db.courses.filter(c=>enrolled(db,req.user.id,c.id)).map(c=>coursePayload(db,c,req.user.id)));});
app.post('/api/courses/:id/enroll',auth,(req,res)=>{const db=loadDB();const c=db.courses.find(x=>x.id===Number(req.params.id));if(!c)return res.status(404).json({error:'Course not found'});if(c.price>0)return res.status(402).json({error:'This is a paid course. Please use checkout.',paymentRequired:true,price:c.price});if(!enrolled(db,req.user.id,c.id))db.enrollments.push({id:Date.now(),userId:req.user.id,courseId:c.id,status:'active',source:'free',createdAt:new Date().toISOString()});saveDB(db);res.json({ok:true,courseId:c.id});});

function razorpayRequest(method, pathname, body) { return new Promise((resolve,reject)=>{ const key=process.env.RAZORPAY_KEY_ID, secret=process.env.RAZORPAY_KEY_SECRET; if(!key||!secret)return reject(new Error('Razorpay is not configured on the server.')); const data=body?JSON.stringify(body):''; const req=https.request({hostname:'api.razorpay.com',path:pathname,method,auth:key+':'+secret,headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)}},r=>{let out='';r.on('data',d=>out+=d);r.on('end',()=>{try{const j=JSON.parse(out);if(r.statusCode>=200&&r.statusCode<300)resolve(j);else reject(new Error(j.error?.description||'Razorpay request failed'));}catch{reject(new Error('Invalid Razorpay response'));}})});req.on('error',reject);if(data)req.write(data);req.end(); }); }
app.get('/api/payment/config',auth,(req,res)=>res.json({keyId:process.env.RAZORPAY_KEY_ID||null,configured:!!(process.env.RAZORPAY_KEY_ID&&process.env.RAZORPAY_KEY_SECRET)}));
app.post('/api/payment/order',auth,async(req,res)=>{try{const db=loadDB();const c=db.courses.find(x=>x.id===Number(req.body.courseId));if(!c)return res.status(404).json({error:'Course not found'});if(enrolled(db,req.user.id,c.id))return res.status(409).json({error:'You already have access to this course'});if(!c.price||c.price<=0)return res.status(400).json({error:'This course is free. Use enrol.'});const order=await razorpayRequest('POST','/v1/orders',{amount:Math.round(c.price*100),currency:'INR',receipt:`JME-${req.user.id}-${c.id}-${Date.now()}`,notes:{userId:String(req.user.id),courseId:String(c.id)}});db.payments.push({id:Date.now(),userId:req.user.id,courseId:c.id,orderId:order.id,amount:c.price,currency:'INR',status:'created',createdAt:new Date().toISOString()});saveDB(db);res.json({orderId:order.id,amount:order.amount,currency:order.currency,keyId:process.env.RAZORPAY_KEY_ID,course:{id:c.id,title:c.title,price:c.price}});}catch(e){res.status(503).json({error:e.message});}});
app.post('/api/payment/verify',auth,(req,res)=>{const {razorpay_order_id,razorpay_payment_id,razorpay_signature,courseId}=req.body||{};if(!razorpay_order_id||!razorpay_payment_id||!razorpay_signature)return res.status(400).json({error:'Payment details missing'});const db=loadDB();const c=db.courses.find(x=>x.id===Number(courseId));const p=db.payments.find(x=>x.orderId===razorpay_order_id&&x.userId===req.user.id&&x.courseId===Number(courseId));if(!c||!p)return res.status(400).json({error:'Payment/order does not match this account and course'});const expected=crypto.createHmac('sha256',process.env.RAZORPAY_KEY_SECRET||'').update(razorpay_order_id+'|'+razorpay_payment_id).digest('hex');if(!process.env.RAZORPAY_KEY_SECRET||!crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(razorpay_signature)))return res.status(400).json({error:'Payment signature verification failed'});p.paymentId=razorpay_payment_id;p.status='paid';p.paidAt=new Date().toISOString();if(!enrolled(db,req.user.id,c.id))db.enrollments.push({id:Date.now(),userId:req.user.id,courseId:c.id,status:'active',source:'razorpay',paymentId:razorpay_payment_id,createdAt:new Date().toISOString()});saveDB(db);res.json({ok:true,course:coursePayload(db,c,req.user.id)});});

app.get('/api/tests',auth,(req,res)=>res.json(loadDB().tests));
app.get('/api/tests/:id/questions',auth,(req,res)=>{const db=loadDB();const t=db.tests.find(x=>x.id===Number(req.params.id));if(!t)return res.status(404).json({error:'Test not found'});if(t.courseId&&!enrolled(db,req.user.id,t.courseId))return res.status(403).json({error:'Please purchase/enrol in the course to access this test',courseId:t.courseId});const qs=testQuestions(db,t.id);if(!qs.length)return res.status(404).json({error:'No questions have been added to this test yet'});res.json({test:t,questions:qs.map(publicQuestion)});});
app.post('/api/test/:id/start',auth,(req,res)=>{const db=loadDB();const t=db.tests.find(x=>x.id===Number(req.params.id));if(!t)return res.status(404).json({error:'Test not found'});if(t.courseId&&!enrolled(db,req.user.id,t.courseId))return res.status(403).json({error:'Course access required',courseId:t.courseId});const qs=testQuestions(db,t.id);if(!qs.length)return res.status(400).json({error:'This test has no question bank yet'});const existing=db.attempts.find(a=>a.userId===req.user.id&&a.testId===t.id&&a.status==='in_progress');if(existing)return res.json({attemptId:existing.id,test:t,questions:qs.map(publicQuestion),startedAt:existing.startedAt,expiresAt:existing.expiresAt,answers:existing.answers});const now=Date.now();const a={id:crypto.randomUUID(),userId:req.user.id,testId:t.id,startedAt:new Date(now).toISOString(),expiresAt:new Date(now+t.duration*60000).toISOString(),answers:{},status:'in_progress'};db.attempts.push(a);saveDB(db);res.json({attemptId:a.id,test:t,questions:qs.map(publicQuestion),startedAt:a.startedAt,expiresAt:a.expiresAt,answers:a.answers});});
app.post('/api/test/attempt/:id/save',auth,(req,res)=>{const db=loadDB();const a=db.attempts.find(x=>x.id===req.params.id&&x.userId===req.user.id&&x.status==='in_progress');if(!a)return res.status(404).json({error:'Attempt not found'});if(Date.now()>new Date(a.expiresAt).getTime())return res.status(409).json({error:'Time expired. Submit the test.'});a.answers=req.body.answers||{};saveDB(db);res.json({ok:true});});
app.post('/api/test/attempt/:id/submit',auth,(req,res)=>{const db=loadDB();const a=db.attempts.find(x=>x.id===req.params.id&&x.userId===req.user.id&&x.status==='in_progress');if(!a)return res.status(404).json({error:'Attempt not found or already submitted'});const t=db.tests.find(x=>x.id===a.testId);const qs=testQuestions(db,t.id);const answers=req.body.answers||a.answers||{};let correct=0,attempted=0;const analysis=qs.map(q=>{const raw=answers[q.id];const selected=raw===undefined||raw===null||raw===''?null:Number(raw);if(selected!==null)attempted++;const isCorrect=selected!==null&&selected===q.answer;if(isCorrect)correct++;return{questionId:q.id,selected,correctAnswer:q.answer,isCorrect,explanation:q.explanation||''};});const total=qs.length,score=correct,percentage=total?Math.round(score/total*1000)/10:0;a.answers=answers;a.status='submitted';a.submittedAt=new Date().toISOString();const result={id:Date.now(),userId:req.user.id,testId:t.id,testTitle:t.title,score,total,percentage,correct,wrong:attempted-correct,unattempted:total-attempted,answers,analysis,status:'Submitted',createdAt:a.submittedAt};db.results.push(result);saveDB(db);const ranking=db.results.filter(r=>r.testId===t.id).sort((x,y)=>y.score-x.score||new Date(x.createdAt)-new Date(y.createdAt));const rank=ranking.findIndex(r=>r.id===result.id)+1;res.json({...result,rank,totalParticipants:ranking.length});});
app.get('/api/results/:id',auth,(req,res)=>{const db=loadDB();const r=db.results.find(x=>x.id===Number(req.params.id)&&x.userId===req.user.id);if(!r)return res.status(404).json({error:'Result not found'});const ranking=db.results.filter(x=>x.testId===r.testId).sort((a,b)=>b.score-a.score);res.json({...r,rank:ranking.findIndex(x=>x.id===r.id)+1,totalParticipants:ranking.length});});

app.get('/api/materials',auth,(req,res)=>{const db=loadDB();res.json(db.materials.map(m=>({...m,accessible:!m.courseId||enrolled(db,req.user.id,m.courseId)})));});
app.get('/api/material/:id',auth,(req,res)=>{const db=loadDB();const m=db.materials.find(x=>x.id===Number(req.params.id));if(!m)return res.status(404).json({error:'Material not found'});if(m.courseId&&!enrolled(db,req.user.id,m.courseId))return res.status(403).json({error:'Course access required'});const file=path.join(UPLOAD_DIR,m.storageName);if(!fs.existsSync(file))return res.status(404).json({error:'File not found'});res.download(file,m.filename);});
app.get('/api/lesson/:id/stream',auth,(req,res)=>{const db=loadDB();const l=db.lessons.find(x=>x.id===Number(req.params.id));if(!l)return res.status(404).json({error:'Lesson not found'});if(!enrolled(db,req.user.id,l.courseId))return res.status(403).json({error:'Course access required'});const file=path.join(UPLOAD_DIR,l.storageName);if(!fs.existsSync(file))return res.status(404).json({error:'Video not found'});const stat=fs.statSync(file);const range=req.headers.range;const mime=l.mime||'video/mp4';if(!range){res.writeHead(200,{'Content-Length':stat.size,'Content-Type':mime,'Accept-Ranges':'bytes'});return fs.createReadStream(file).pipe(res);}const [s,e]=range.replace(/bytes=/,'').split('-');const start=parseInt(s,10);const end=e?parseInt(e,10):stat.size-1;if(start>=stat.size||end>=stat.size)return res.status(416).end();res.writeHead(206,{'Content-Range':`bytes ${start}-${end}/${stat.size}`,'Accept-Ranges':'bytes','Content-Length':end-start+1,'Content-Type':mime});fs.createReadStream(file,{start,end}).pipe(res);});



// Live classroom: JaaS/Jitsi room + attendance + automatic cloud recording
const JaaS = {
  enabled: Boolean(process.env.JAAS_APP_ID && process.env.JAAS_API_KEY_ID && process.env.JAAS_PRIVATE_KEY),
  appId: process.env.JAAS_APP_ID || '',
  apiKeyId: process.env.JAAS_API_KEY_ID || '',
  privateKey: process.env.JAAS_PRIVATE_KEY ? process.env.JAAS_PRIVATE_KEY.replace(/\\n/g, '\n') : '',
  webhookSecret: process.env.JAAS_WEBHOOK_SECRET || '',
  domain: process.env.JAAS_DOMAIN || '8x8.vc'
};
function jaasToken(user, roomName, teacher=false) {
  if(!JaaS.enabled) return null;
  const now=Math.floor(Date.now()/1000);
  return jwt.sign({
    aud:'jitsi', iss:'chat', sub:JaaS.appId, room:roomName,
    nbf:now-10, exp:now+2*60*60,
    context:{
      user:{id:String(user.id),name:user.name,email:user.email||'',moderator:teacher?'true':'false'},
      features:{recording:teacher,livestreaming:false,transcription:false,'outbound-call':false}
    }
  }, JaaS.privateKey, { algorithm:'RS256', keyid:JaaS.apiKeyId, header:{typ:'JWT'} });
}
function livePayload(db, x, userId) {
  const course = x.courseId ? db.courses.find(c => c.id === x.courseId) : null;
  const access = !x.courseId || enrolled(db, userId, x.courseId);
  const teacher = db.users.find(u=>u.id===userId)?.role==='admin';
  const base = x.googleMeetingUri ? x.googleMeetingUri : (JaaS.enabled ? `https://${JaaS.domain}` : 'https://meet.jit.si');
  const room = JaaS.enabled ? `${JaaS.appId}/${x.roomName}` : x.roomName;
  const token = jaasToken(db.users.find(u=>u.id===userId)||{id:userId,name:'Student'}, x.roomName, teacher);
  return { ...x, courseTitle: course ? course.title : 'All Students', accessible: access,
    provider:x.googleMeetingUri?'google':(JaaS.enabled?'jaas':'jitsi'),
    googleEnabled:!!x.googleMeetingUri, googleMeetingUri:x.googleMeetingUri||'', googleSpaceName:x.googleSpaceName||'',
    jaasEnabled:JaaS.enabled && !x.googleMeetingUri, joinUrl: x.googleMeetingUri || `${base}/${room.split('/').map(encodeURIComponent).join('/')}`,
    jaasDomain:JaaS.domain, jaasRoom:room, jaasJwt:token || undefined,
    recordingStatus:x.recordingStatus||'not_started' };
}
function verifyJaasWebhook(req){
  if(!JaaS.webhookSecret) return process.env.NODE_ENV!=='production';
  const header=req.headers['x-jaas-signature']; if(!header||!req.rawBody)return false;
  const parts=Object.fromEntries(String(header).split(',').map(x=>x.split('=')));
  const ts=Number(parts.t); const sig=parts.v1; if(!ts||!sig)return false;
  if(Math.abs(Date.now()/1000-ts)>300)return false;
  const expected=crypto.createHmac('sha256',JaaS.webhookSecret).update(`${ts}.${req.rawBody.toString('utf8')}`).digest('base64');
  try{return crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(sig));}catch{return false;}
}
const R2 = {
  enabled: Boolean(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET && S3Client && PutObjectCommand && getSignedUrl),
  accountId: process.env.R2_ACCOUNT_ID || '',
  accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  bucket: process.env.R2_BUCKET || '',
  prefix: (process.env.R2_RECORDINGS_PREFIX || 'recordings').replace(/^\/+|\/+$/g,''),
  endpoint: process.env.R2_ENDPOINT || (process.env.R2_ACCOUNT_ID ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : ''),
  client: null
};
if(R2.enabled){
  R2.client=new S3Client({region:'auto',endpoint:R2.endpoint,credentials:{accessKeyId:R2.accessKeyId,secretAccessKey:R2.secretAccessKey}});
}
async function downloadRecording(url, filePath, objectKey){
  const r=await fetch(url); if(!r.ok)throw new Error(`Recording download failed: ${r.status}`);
  const size=Number(r.headers.get('content-length')||0)||undefined;
  if(R2.enabled){
    if(!r.body) throw new Error('Recording response had no body');
    await R2.client.send(new PutObjectCommand({Bucket:R2.bucket,Key:objectKey,Body:require('stream').Readable.fromWeb(r.body),ContentType:'video/mp4',ContentLength:size,CacheControl:'private, max-age=0'}));
    return {size:size||0, storage:'r2', objectKey};
  }
  const buf=Buffer.from(await r.arrayBuffer()); fs.writeFileSync(filePath,buf);
  return {size:buf.length, storage:'local', storageName:path.basename(filePath)};
}
async function deleteStoredRecording(rec){
  if(rec.storage==='r2' && R2.enabled && rec.objectKey){
    await R2.client.send(new DeleteObjectCommand({Bucket:R2.bucket,Key:rec.objectKey}));
  } else if(rec.storageName){
    try{fs.unlinkSync(path.join(UPLOAD_DIR,rec.storageName));}catch{}
  }
}
function classFromFqn(db,fqn){
  const room=String(fqn||'').split('/').slice(1).join('/');
  const name=decodeURIComponent(room.split('@')[0]);
  return db.liveClasses.find(c=>c.roomName===name);
}
app.post('/api/jaas/webhook', async (req,res)=>{
  if(!verifyJaasWebhook(req)) return res.status(401).json({error:'Invalid webhook signature'});
  const event=req.body||{}; const db=loadDB();
  if(event.idempotencyKey && db.liveWebhookEvents.includes(event.idempotencyKey)) return res.json({ok:true,duplicate:true});
  if(event.idempotencyKey) db.liveWebhookEvents.push(event.idempotencyKey);
  const cls=classFromFqn(db,event.fqn); if(!cls){saveDB(db);return res.json({ok:true,ignored:true});}
  const type=event.eventType; const d=event.data||{};
  if(type==='RECORDING_STARTED'){cls.recordingStatus='recording';cls.recordingStartedAt=new Date().toISOString();}
  if(type==='RECORDING_ENDED'){cls.recordingStatus='processing';cls.recordingEndedAt=new Date().toISOString();}
  if(type==='RECORDING_UPLOADED' && d.preAuthenticatedLink){
    cls.recordingStatus='downloading'; cls.recordingUploadedAt=new Date().toISOString();
    const rid=Date.now(); const safeTitle=`${cls.title.replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'')||'live-class'}`; const storageName=`live-${cls.id}-${rid}.mp4`; const objectKey=`${R2.prefix}/class-${cls.id}/${rid}-${safeTitle}.mp4`; const file=path.join(UPLOAD_DIR,storageName);
    try{
      const stored=await downloadRecording(d.preAuthenticatedLink,file,objectKey);
      const rec={id:rid,classId:cls.id,filename:`${safeTitle}.mp4`,storage:stored.storage,storageName:stored.storageName||null,objectKey:stored.objectKey||null,size:stored.size||0,createdAt:new Date().toISOString(),duration:null};
      db.liveRecordings.push(rec); cls.recordingId=rec.id; cls.recordingStatus='ready'; cls.recordingStorage=stored.storage; cls.recordingUrl=`/api/live/${cls.id}/recording`;
    }catch(e){cls.recordingStatus='download_failed';cls.recordingError=String(e.message||e);}
  }
  saveDB(db); res.json({ok:true});
});
app.get('/api/live', auth, (req,res) => {
  const db=loadDB();
  res.json(db.liveClasses.filter(x => !x.courseId || enrolled(db,req.user.id,x.courseId)).sort((a,b)=>new Date(a.scheduledAt)-new Date(b.scheduledAt)).map(x=>livePayload(db,x,req.user.id)));
});
app.get('/api/live/:id', auth, (req,res) => {
  const db=loadDB(); const x=db.liveClasses.find(v=>v.id===Number(req.params.id));
  if(!x)return res.status(404).json({error:'Live class not found'});
  if(x.courseId && !enrolled(db,req.user.id,x.courseId) && req.user.role!=='admin') return res.status(403).json({error:'Course access required'});
  res.json(livePayload(db,x,req.user.id));
});
app.get('/api/live/:id/recording',auth,async(req,res)=>{
  const db=loadDB();const x=db.liveClasses.find(v=>v.id===Number(req.params.id));
  if(!x)return res.status(404).json({error:'Live class not found'});
  if(x.courseId&&!enrolled(db,req.user.id,x.courseId)&&req.user.role!=='admin')return res.status(403).json({error:'Course access required'});
  const r=db.liveRecordings.find(v=>v.id===x.recordingId);if(!r)return res.status(404).json({error:'Recording is not ready yet'});
  if(r.storage==='google_drive' && r.driveFileId){ try { return await Google.driveStream(db,r.driveFileId,req,res); } catch(e) { return res.status(503).json({error:e.message}); } }
  if(r.storage==='r2' && R2.enabled && r.objectKey){
    const url=await getSignedUrl(R2.client,new GetObjectCommand({Bucket:R2.bucket,Key:r.objectKey,ResponseContentType:'video/mp4'}),{expiresIn:900});
    return res.redirect(url);
  }
  const file=path.join(UPLOAD_DIR,r.storageName||'');if(!r.storageName||!fs.existsSync(file))return res.status(404).json({error:'Recording file not found'});
  const stat=fs.statSync(file),range=req.headers.range;
  res.setHeader('Accept-Ranges','bytes');res.setHeader('Content-Type','video/mp4');
  if(!range){res.setHeader('Content-Length',stat.size);return fs.createReadStream(file).pipe(res)}
  const [ss,ee]=range.replace('bytes=','').split('-');const start=parseInt(ss,10);const end=ee?parseInt(ee,10):stat.size-1;if(start>=stat.size||end>=stat.size)return res.status(416).end();
  res.writeHead(206,{'Content-Range':`bytes ${start}-${end}/${stat.size}`,'Content-Length':end-start+1});fs.createReadStream(file,{start,end}).pipe(res);
});
app.post('/api/live/:id/attendance', auth, (req,res) => {
  const db=loadDB(); const x=db.liveClasses.find(v=>v.id===Number(req.params.id)); if(!x)return res.status(404).json({error:'Live class not found'});
  if(x.courseId && !enrolled(db,req.user.id,x.courseId) && req.user.role!=='admin')return res.status(403).json({error:'Course access required'});
  let a=db.liveAttendance.find(v=>v.classId===x.id&&v.userId===req.user.id); if(!a){a={id:Date.now(),classId:x.id,userId:req.user.id,name:req.user.name,joinedAt:new Date().toISOString(),lastSeen:new Date().toISOString()};db.liveAttendance.push(a)}else a.lastSeen=new Date().toISOString(); saveDB(db);res.json({ok:true});
});
app.get('/api/live/:id/messages', auth, (req,res) => { const db=loadDB();const x=db.liveClasses.find(v=>v.id===Number(req.params.id));if(!x)return res.status(404).json({error:'Live class not found'});if(x.courseId&&!enrolled(db,req.user.id,x.courseId)&&req.user.role!=='admin')return res.status(403).json({error:'Course access required'});res.json(db.liveMessages.filter(m=>m.classId===x.id&&!m.deleted).slice(-100)); });
app.post('/api/live/:id/messages', auth, (req,res) => { const db=loadDB();const x=db.liveClasses.find(v=>v.id===Number(req.params.id));if(!x)return res.status(404).json({error:'Live class not found'});if(x.courseId&&!enrolled(db,req.user.id,x.courseId)&&req.user.role!=='admin')return res.status(403).json({error:'Course access required'});const text=String(req.body.text||'').trim();if(!text)return res.status(400).json({error:'Message required'});const m={id:Date.now(),classId:x.id,userId:req.user.id,name:req.user.name,text:text.slice(0,500),role:req.user.role,createdAt:new Date().toISOString(),deleted:false};db.liveMessages.push(m);saveDB(db);res.json(m); });
app.delete('/api/admin/live/message/:id',auth,admin,(req,res)=>{const db=loadDB();const m=db.liveMessages.find(v=>v.id===Number(req.params.id));if(!m)return res.status(404).json({error:'Message not found'});m.deleted=true;saveDB(db);res.json({ok:true})});
app.get('/api/admin/live',auth,admin,(req,res)=>{const db=loadDB();res.json(db.liveClasses.slice().sort((a,b)=>new Date(b.scheduledAt)-new Date(a.scheduledAt)).map(x=>{const p=livePayload(db,x,req.user.id);p.attendeeCount=db.liveAttendance.filter(a=>a.classId===x.id).length;return p;}));});
app.post('/api/admin/live',auth,admin,async(req,res)=>{const {title,courseId=null,scheduledAt,duration=60,roomName='',description=''}=req.body||{};if(!title||!scheduledAt)return res.status(400).json({error:'Title and scheduled time are required'});const db=loadDB();const id=Date.now();const room=(roomName||`JME-${id}-${String(title).replace(/[^a-zA-Z0-9]+/g,'-').slice(0,35)}`).replace(/-+/g,'-');const item={id,title,courseId:courseId?Number(courseId):null,scheduledAt:new Date(scheduledAt).toISOString(),duration:Number(duration)||60,roomName:room,description,status:'scheduled',createdAt:new Date().toISOString(),startedAt:null,endedAt:null,recordingUrl:'',recordingStatus:JaaS.enabled?'waiting_for_class':(db.googleAuth?.refreshToken?'google_ready':'not_configured')};db.liveClasses.push(item);if(db.googleAuth?.refreshToken){try{const space=await Google.createMeet(db,title,true,true);item.provider='google';item.googleSpaceName=space.name;item.googleMeetingUri=space.meetingUri;item.googleMeetingCode=space.meetingCode;item.recordingStatus='google_auto_recording';}catch(e){item.googleError=String(e.message||e);}}saveDB(db);res.json(livePayload(db,item,req.user.id));});
app.post('/api/admin/live/:id/start',auth,admin,(req,res)=>{const db=loadDB();const x=db.liveClasses.find(v=>v.id===Number(req.params.id));if(!x)return res.status(404).json({error:'Live class not found'});x.status='live';x.startedAt=new Date().toISOString();if(x.googleMeetingUri)x.recordingStatus='google_auto_recording';else if(JaaS.enabled)x.recordingStatus='ready_to_start';saveDB(db);res.json(livePayload(db,x,req.user.id));});
app.post('/api/admin/live/:id/end',auth,admin,async(req,res)=>{const db=loadDB();const x=db.liveClasses.find(v=>v.id===Number(req.params.id));if(!x)return res.status(404).json({error:'Live class not found'});x.status='ended';x.endedAt=new Date().toISOString();if(req.body.recordingUrl)x.recordingUrl=String(req.body.recordingUrl).trim();if(x.googleSpaceName&&db.googleAuth?.refreshToken){try{await Google.googleJson(db,`https://meet.googleapis.com/v2/${x.googleSpaceName}:endActiveConference`,{method:'POST'})}catch(e){x.googleEndError=String(e.message||e)}}saveDB(db);res.json(livePayload(db,x,req.user.id));});
app.delete('/api/admin/live/:id',auth,admin,async(req,res)=>{const db=loadDB();const id=Number(req.params.id);if(!db.liveClasses.some(v=>v.id===id))return res.status(404).json({error:'Live class not found'});const recs=db.liveRecordings.filter(v=>v.classId===id);for(const r of recs){try{await deleteStoredRecording(r)}catch(e){console.error('recording delete failed',e.message)}}db.liveRecordings=db.liveRecordings.filter(v=>v.classId!==id);db.liveClasses=db.liveClasses.filter(v=>v.id!==id);db.liveMessages=db.liveMessages.filter(v=>v.classId!==id);db.liveAttendance=db.liveAttendance.filter(v=>v.classId!==id);saveDB(db);res.json({ok:true});});
app.get('/api/admin/live/:id/attendance',auth,admin,(req,res)=>{const db=loadDB();const id=Number(req.params.id);res.json(db.liveAttendance.filter(v=>v.classId===id).sort((a,b)=>new Date(a.joinedAt)-new Date(b.joinedAt)));});
app.get('/api/admin/live/config',auth,admin,(req,res)=>res.json({jaasEnabled:JaaS.enabled,domain:JaaS.domain,appId:JaaS.enabled?JaaS.appId:'',webhookPath:'/api/jaas/webhook',recordingStorage:R2.enabled?'Cloudflare R2':'Local server storage',r2Enabled:R2.enabled}));

app.post('/api/answer',auth,(req,res)=>{const {question,answer}=req.body||{};if(!question||!answer)return res.status(400).json({error:'Question and answer are required'});const db=loadDB();const item={id:Date.now(),userId:req.user.id,student:req.user.name,question,answer,status:'Pending evaluation',createdAt:new Date().toISOString()};db.submissions.push(item);saveDB(db);res.json(item);});

app.post('/api/admin/course',auth,admin,(req,res)=>{const {title,category,tests=0,lessons=0,price=0,description=''}=req.body||{};if(!title)return res.status(400).json({error:'Title required'});const db=loadDB();const item={id:Date.now(),title,category:category||'Law',tests:Number(tests),lessons:Number(lessons),price:Number(price)||0,description};db.courses.push(item);saveDB(db);res.json(item);});
app.post('/api/admin/test',auth,admin,(req,res)=>{const {title,type='MCQ',questions=10,duration=30,marks=100,courseId=null}=req.body||{};if(!title)return res.status(400).json({error:'Title required'});const db=loadDB();const item={id:Date.now(),title,type,questionCount:Number(questions),duration:Number(duration),marks:Number(marks),courseId:courseId?Number(courseId):null};db.tests.push(item);saveDB(db);res.json(item);});
app.post('/api/admin/question',auth,admin,(req,res)=>{const {testId,text,options,answer,explanation=''}=req.body||{};if(!testId||!text||!Array.isArray(options)||options.length<2||answer===undefined)return res.status(400).json({error:'testId, text, 2+ options and correct answer are required'});const db=loadDB();if(!db.tests.find(x=>x.id===Number(testId)))return res.status(404).json({error:'Test not found'});const q={id:Date.now(),testId:Number(testId),text,options,answer:Number(answer),explanation};db.questions.push(q);saveDB(db);res.json(publicQuestion(q));});
app.get('/api/admin/questions',auth,admin,(req,res)=>res.json(loadDB().questions));
app.delete('/api/admin/question/:id',auth,admin,(req,res)=>{const db=loadDB();const n=db.questions.length;db.questions=db.questions.filter(q=>q.id!==Number(req.params.id));if(db.questions.length===n)return res.status(404).json({error:'Question not found'});saveDB(db);res.json({ok:true});});
app.post('/api/admin/announcement',auth,admin,(req,res)=>{const {title,body}=req.body||{};if(!title||!body)return res.status(400).json({error:'Title and body required'});const db=loadDB();const item={id:Date.now(),title,body,createdAt:new Date().toISOString()};db.announcements.push(item);saveDB(db);res.json(item);});
app.post('/api/admin/material',auth,admin,upload.single('file'),(req,res)=>{if(!req.file)return res.status(400).json({error:'File required'});const db=loadDB();const item={id:Date.now(),title:req.body.title||req.file.originalname,course:req.body.course||'General',courseId:req.body.courseId?Number(req.body.courseId):null,storageName:req.file.filename,filename:req.file.originalname,createdAt:new Date().toISOString()};db.materials.push(item);saveDB(db);res.json(item);});
app.post('/api/admin/lesson',auth,admin,upload.single('video'),(req,res)=>{if(!req.file)return res.status(400).json({error:'Video file required'});const db=loadDB();const courseId=Number(req.body.courseId);if(!db.courses.find(c=>c.id===courseId))return res.status(404).json({error:'Course not found'});const item={id:Date.now(),courseId,title:req.body.title||req.file.originalname,description:req.body.description||'',chapter:req.body.chapter||'General',order:Number(req.body.order)||1,type:'video',duration:req.body.duration||'',storageName:req.file.filename,filename:req.file.originalname,mime:req.file.mimetype,createdAt:new Date().toISOString()};db.lessons.push(item);saveDB(db);res.json({...item,storageName:undefined});});
app.get('/api/admin/submissions',auth,admin,(req,res)=>res.json(loadDB().submissions.slice().reverse()));
app.post('/api/admin/submission/:id',auth,admin,(req,res)=>{const db=loadDB();const item=db.submissions.find(x=>x.id===Number(req.params.id));if(!item)return res.status(404).json({error:'Submission not found'});item.status=req.body.status||'Evaluated';item.feedback=req.body.feedback||'';item.marks=req.body.marks==null?null:Number(req.body.marks);saveDB(db);res.json(item);});
app.post('/api/admin/enroll',auth,admin,(req,res)=>{const {email,courseId}=req.body||{};const db=loadDB();const u=db.users.find(x=>x.email.toLowerCase()===String(email||'').toLowerCase().trim());const c=db.courses.find(x=>x.id===Number(courseId));if(!u||!c)return res.status(404).json({error:'Student or course not found'});if(!enrolled(db,u.id,c.id))db.enrollments.push({id:Date.now(),userId:u.id,courseId:c.id,status:'active',source:'admin',createdAt:new Date().toISOString()});saveDB(db);res.json({ok:true});});
app.get('/api/admin/payments',auth,admin,(req,res)=>res.json(loadDB().payments.slice().reverse()));
app.get('/api/admin/students',auth,admin,(req,res)=>{const db=loadDB();res.json(db.users.filter(u=>u.role==='student').map(u=>({...safeUser(u),courses:db.enrollments.filter(e=>e.userId===u.id&&e.status==='active').map(e=>e.courseId)})));});


// Learning progress
app.get('/api/courses/:id/progress',auth,(req,res)=>{const db=loadDB();const courseId=Number(req.params.id);if(!enrolled(db,req.user.id,courseId))return res.status(403).json({error:'Course access required'});const lessons=db.lessons.filter(l=>l.courseId===courseId);const done=db.progress.filter(p=>p.userId===req.user.id&&p.courseId===courseId&&p.completed).map(p=>p.lessonId);res.json({courseId,completedLessonIds:done,totalLessons:lessons.length,completed:done.length,percentage:lessons.length?Math.round(done.length/lessons.length*100):0});});
app.post('/api/lesson/:id/progress',auth,(req,res)=>{const db=loadDB();const l=db.lessons.find(x=>x.id===Number(req.params.id));if(!l)return res.status(404).json({error:'Lesson not found'});if(!enrolled(db,req.user.id,l.courseId))return res.status(403).json({error:'Course access required'});const completed=!!req.body.completed;let item=db.progress.find(p=>p.userId===req.user.id&&p.lessonId===l.id);if(!item){item={id:Date.now(),userId:req.user.id,courseId:l.courseId,lessonId:l.id,completed:false,updatedAt:new Date().toISOString()};db.progress.push(item)}item.completed=completed;item.updatedAt=new Date().toISOString();saveDB(db);res.json(item);});

// Admin analytics and bulk question tools
app.get('/api/admin/stats',auth,admin,(req,res)=>{const db=loadDB();const students=db.users.filter(u=>u.role==='student');const paid=db.payments.filter(p=>p.status==='paid');const revenue=paid.reduce((n,p)=>n+Number(p.amount||0),0);const submitted=db.results.length;const avg=submitted?Math.round(db.results.reduce((n,r)=>n+Number(r.percentage||0),0)/submitted*10)/10:0;const courseStats=db.courses.map(c=>{const studentsCount=db.enrollments.filter(e=>e.courseId===c.id&&e.status==='active').length;const tests=db.tests.filter(t=>t.courseId===c.id).length;const lessons=db.lessons.filter(l=>l.courseId===c.id).length;return{id:c.id,title:c.title,students:studentsCount,tests,lessons,revenue:paid.filter(p=>p.courseId===c.id).reduce((n,p)=>n+Number(p.amount||0),0)}});res.json({students:students.length,courses:db.courses.length,tests:db.tests.length,questions:db.questions.length,lessons:db.lessons.length,materials:db.materials.length,submissions:db.submissions.length,attempts:db.results.length,revenue,paidOrders:paid.length,averageScore:avg,courseStats});});
app.post('/api/admin/questions/import',auth,admin,(req,res)=>{try{const db=loadDB();let rows=req.body.rows;if(typeof rows==='string')rows=JSON.parse(rows);if(!Array.isArray(rows)||!rows.length)return res.status(400).json({error:'rows array is required'});const added=[];for(const row of rows){const testId=Number(row.testId);const text=String(row.text||'').trim();const options=Array.isArray(row.options)?row.options:[row.optionA,row.optionB,row.optionC,row.optionD].filter(x=>String(x??'').trim()!=='');let answer=row.answer;if(typeof answer==='string'&&/^[A-Da-d]$/.test(answer.trim()))answer=answer.trim().toUpperCase().charCodeAt(0)-65;answer=Number(answer);if(!testId||!text||options.length<2||!Number.isInteger(answer)||answer<0||answer>=options.length)continue;if(!db.tests.find(t=>t.id===testId))continue;const q={id:Date.now()+added.length,testId,text,options:options.map(String),answer,explanation:String(row.explanation||'')};db.questions.push(q);added.push(q)}saveDB(db);res.json({added:added.length,skipped:rows.length-added.length})}catch(e){res.status(400).json({error:'Invalid JSON import format'})}});
app.delete('/api/admin/course/:id',auth,admin,(req,res)=>{const db=loadDB();const id=Number(req.params.id);if(!db.courses.some(c=>c.id===id))return res.status(404).json({error:'Course not found'});db.courses=db.courses.filter(c=>c.id!==id);db.lessons=db.lessons.filter(l=>l.courseId!==id);db.enrollments=db.enrollments.filter(e=>e.courseId!==id);db.materials=db.materials.filter(m=>m.courseId!==id);db.tests=db.tests.filter(t=>t.courseId!==id);saveDB(db);res.json({ok:true})});
app.delete('/api/admin/test/:id',auth,admin,(req,res)=>{const db=loadDB();const id=Number(req.params.id);if(!db.tests.some(t=>t.id===id))return res.status(404).json({error:'Test not found'});db.tests=db.tests.filter(t=>t.id!==id);db.questions=db.questions.filter(q=>q.testId!==id);saveDB(db);res.json({ok:true})});

app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
initPersistence().then(()=>app.listen(PORT,()=>console.log(`Judiciary Made Easy running on http://localhost:${PORT}`))).catch(err=>{console.error('Startup failed:',err);process.exit(1);});
