// ========================
// SNS - SISTEMA NACIONAL DE SAÚDE
// MINISTÉRIO DA SAÚDE - ANGOLA
// VERSÃO FINAL CORRIGIDA
// ========================
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const crypto = require('crypto');
const PDFDocument = require('pdfkit');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ========================
// CONFIGURAÇÕES
// ========================
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('public'));

// ========================
// CONEXÃO MONGODB
// ========================
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sns';
mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ MongoDB conectado'))
  .catch(err => console.log('❌ MongoDB erro:', err));

// ========================
// FUNÇÕES AUXILIARES
// ========================
function gerarApiKey() {
  return 'SNS-' + Date.now() + '-' + crypto.randomBytes(8).toString('hex').toUpperCase();
}

function gerarChaveAcesso(tipo) {
  const prefixo = tipo === 'hospital' ? 'HOSP' : 'EMP';
  return prefixo + '-' + Date.now() + '-' + crypto.randomBytes(6).toString('hex').toUpperCase();
}

function validarNIF(nif) {
  return /^\d{10}$/.test(nif);
}

function gerarNumeroCertificado(tipo) {
  const ano = new Date().getFullYear();
  const mes = (new Date().getMonth() + 1).toString().padStart(2, '0');
  const random = crypto.randomBytes(4).toString('hex').toUpperCase();
  const prefixos = { 1: 'GEN', 2: 'SAU', 3: 'INC', 4: 'APT', 5: 'MAT', 6: 'CPN', 7: 'EPI' };
  return prefixos[tipo] + '-' + ano + mes + '-' + random;
}

// =============================================
// MODELOS DE DADOS
// =============================================
const userSchema = new mongoose.Schema({
  nome: String,
  email: { type: String, unique: true },
  password: String,
  role: { type: String, default: 'admin' }
});

const labSchema = new mongoose.Schema({
  labId: { type: String, unique: true },
  nome: { type: String, required: true },
  nif: { type: String, required: true, unique: true },
  tipo: { type: String, enum: ['laboratorio', 'hospital', 'clinica'] },
  provincia: { type: String, required: true },
  endereco: String,
  email: { type: String, required: true },
  telefone: String,
  diretor: String,
  apiKey: { type: String, unique: true },
  ativo: { type: Boolean, default: true },
  totalEmissoes: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

const hospitalSchema = new mongoose.Schema({
  nome: { type: String, required: true },
  nif: { type: String, unique: true, required: true },
  provincia: { type: String, required: true },
  endereco: String,
  diretor: { type: String, required: true },
  email: { type: String, required: true },
  telefone: String,
  chaveAcesso: { type: String, unique: true },
  ativo: { type: Boolean, default: true },
  criadoEm: { type: Date, default: Date.now }
});

const empresaSchema = new mongoose.Schema({
  nome: { type: String, required: true },
  nif: { type: String, unique: true, required: true },
  endereco: String,
  email: { type: String, required: true },
  telefone: String,
  responsavel: {
    nome: { type: String, required: true },
    cargo: String,
    email: String
  },
  chaveAcesso: { type: String, unique: true },
  ativo: { type: Boolean, default: true },
  criadoEm: { type: Date, default: Date.now }
});

const certificateSchema = new mongoose.Schema({
  numero: { type: String, unique: true },
  tipo: { type: Number, required: true, enum: [1, 2, 3, 4, 5, 6, 7] },
  paciente: {
    nomeCompleto: { type: String, required: true },
    genero: { type: String, enum: ['M', 'F'] },
    dataNascimento: Date,
    bi: { type: String, required: true }
  },
  dados: {
    genotipo: String,
    grupoSanguineo: String,
    avaliacao: String,
    finalidade: String,
    periodoInicio: Date,
    periodoFim: Date,
    cid: String,
    tipoAptidao: String,
    restricoes: String,
    gestacoes: Number,
    partos: Number,
    dpp: Date,
    consultas: Number,
    examesCPN: {
      genotipo: String,
      vih: String,
      malaria: String,
      hemoglobinia: Number
    },
    doenca: String,
    dataExame: Date,
    metodo: String,
    resultado: String
  },
  hash: { type: String, unique: true },
  emitidoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Lab' },
  emitidoEm: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Lab = mongoose.model('Lab', labSchema);
const Hospital = mongoose.model('Hospital', hospitalSchema);
const Empresa = mongoose.model('Empresa', empresaSchema);
const Certificate = mongoose.model('Certificate', certificateSchema);

// ===========================================
// MIDDLEWARES
// ===========================================
const authMiddleware = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ erro: 'Token não fornecido' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret-key');
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ erro: 'Token inválido' });
  }
};

const labMiddleware = async (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ erro: 'API Key não fornecida' });
  const lab = await Lab.findOne({ apiKey, ativo: true });
  if (!lab) return res.status(401).json({ erro: 'Chave inválida. Use a chave correta para entrar.' });
  req.lab = lab;
  next();
};

// ===========================================
// ROTAS PÚBLICAS
// ===========================================
app.get('/', (req, res) => {
  res.send('<!DOCTYPE html>' +
    '<html>' +
    '<head><title>SNS - Angola</title>' +
    '<style>' +
    'body{background:#006633;font-family:Arial;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;}' +
    '.container{background:white;padding:40px;border-radius:10px;width:350px;text-align:center;}' +
    'h1{color:#006633;}' +
    'a{display:block;margin:15px;padding:12px;background:#006633;color:white;text-decoration:none;border-radius:5px;}' +
    'a:hover{background:#004d26;}' +
    '</style>' +
    '</head>' +
    '<body>' +
    '<div class="container">' +
    '<h1>SNS - Angola</h1>' +
    '<a href="/ministerio">🏛️ Ministério da Saúde</a>' +
    '<a href="/lab-login">🔬 Laboratório</a>' +
    '</div>' +
    '</body></html>');
});

// ============================================
// MINISTÉRIO - LOGIN
// ============================================
app.get('/ministerio', (req, res) => {
  res.send('<!DOCTYPE html>' +
    '<html>' +
    '<head><title>Ministério - Login</title>' +
    '<style>' +
    'body{background:#006633;font-family:Arial;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;}' +
    '.container{background:white;padding:30px;border-radius:10px;width:350px;}' +
    'h2{color:#006633;text-align:center;margin-bottom:20px;}' +
    'input{width:100%;padding:10px;margin:10px 0;border:1px solid #ddd;border-radius:5px;}' +
    'button{width:100%;padding:12px;background:#006633;color:white;border:none;border-radius:5px;cursor:pointer;}' +
    'button:hover{background:#004d26;}' +
    '.error{color:red;margin:10px 0;display:none;text-align:center;}' +
    '</style>' +
    '</head>' +
    '<body>' +
    '<div class="container">' +
    '<h2>Ministério da Saúde</h2>' +
    '<div id="error" class="error"></div>' +
    '<input type="email" id="email" placeholder="Email" value="admin@sns.gov.ao">' +
    '<input type="password" id="password" placeholder="Senha" value="Admin@2025">' +
    '<button onclick="login()">Entrar</button>' +
    '</div>' +
    '<script>' +
    'async function login(){' +
    'const e=document.getElementById("email").value;' +
    'const p=document.getElementById("password").value;' +
    'const r=await fetch("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:e,password:p})});' +
    'const d=await r.json();' +
    'if(d.token){localStorage.setItem("token",d.token);window.location.href="/admin-dashboard";}' +
    'else{document.getElementById("error").style.display="block";document.getElementById("error").innerText="Email ou senha incorretos";}}' +
    '</script>' +
    '</body></html>');
});

// LABORATORIO - LOGIN
app.get('/lab-login', (req, res) => {
  res.send('<!DOCTYPE html>' +
    '<html>' +
    '<head><title>Laboratório - Login</title>' +
    '<style>' +
    'body{background:#006633;font-family:Arial;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;}' +
    '.container{background:white;padding:30px;border-radius:10px;width:350px;}' +
    'h2{color:#006633;text-align:center;margin-bottom:20px;}' +
    'input{width:100%;padding:10px;margin:10px 0;border:1px solid #ddd;border-radius:5px;}' +
    'button{width:100%;padding:12px;background:#006633;color:white;border:none;border-radius:5px;cursor:pointer;}' +
    'button:hover{background:#004d26;}' +
    '.error{color:#dc3545;background:#f8d7da;padding:10px;margin:10px 0;border-radius:5px;display:none;text-align:center;}' +
    '</style>' +
    '</head>' +
    '<body>' +
    '<div class="container">' +
    '<h2>Acesso Laboratório</h2>' +
    '<div id="error" class="error"></div>' +
    '<input type="text" id="apiKey" placeholder="Digite sua API Key">' +
    '<button onclick="login()">Entrar</button>' +
    '</div>' +
    '<script>' +
    'async function login(){' +
    'const key=document.getElementById("apiKey").value.trim();' +
    'const errorDiv=document.getElementById("error");' +
    'errorDiv.style.display="none";' +
    'if(!key){errorDiv.style.display="block";errorDiv.innerText="❌ Digite uma chave";return;}' +
    'try{' +
    'const r=await fetch("/api/labs/verificar",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({apiKey:key})});' +
    'const d=await r.json();' +
    'if(d.valido){localStorage.setItem("labKey",key);window.location.href="/lab-dashboard";}' +
    'else{errorDiv.style.display="block";errorDiv.innerText=d.erro||"❌ Chave inválida";}}' +
    'catch(e){errorDiv.style.display="block";errorDiv.innerText="❌ Erro de conexão";}}' +
    '</script>' +
    '</body></html>');
});

// ============================================
// API DE AUTENTICAÇÃO
// ============================================
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (email === 'admin@sns.gov.ao' && password === 'Admin@2025') {
    let user = await User.findOne({ email });
    if (!user) {
      const senhaHash = await bcrypt.hash(password, 10);
      user = await User.create({ nome: 'Administrador', email, password: senhaHash, role: 'admin' });
    }
    const token = jwt.sign({ id: user._id, email, role: user.role }, process.env.JWT_SECRET || 'secret-key', { expiresIn: '8h' });
    res.json({ token });
  } else {
    res.status(401).json({ erro: 'Email ou senha incorretos' });
  }
});

app.post('/api/labs/verificar', async (req, res) => {
  try {
    const { apiKey } = req.body;
    if (!apiKey) return res.json({ valido: false, erro: '❌ Chave não fornecida' });
    const lab = await Lab.findOne({ apiKey, ativo: true });
    if (lab) return res.json({ valido: true });
    const labInativo = await Lab.findOne({ apiKey });
    if (labInativo) return res.json({ valido: false, erro: '❌ Laboratório desativado. Contacte o ministério.' });
    return res.json({ valido: false, erro: '❌ Chave inválida. Use a chave correta para entrar.' });
  } catch (error) {
    res.status(500).json({ valido: false, erro: '❌ Erro no servidor' });
  }
});

// =============================================
// ROTA PARA CRIAR ADMIN (EMERGÊNCIA)
// =============================================
app.get('/criar-admin', async (req, res) => {
  try {
    const senhaHash = await bcrypt.hash('Admin@2025', 10);
    await User.deleteMany({ email: 'admin@sns.gov.ao' });
    await User.create({ nome: 'Administrador', email: 'admin@sns.gov.ao', password: senhaHash, role: 'admin' });
    res.send('<h1>✅ Admin criado com sucesso!</h1><p>Email: admin@sns.gov.ao</p><p>Senha: Admin@2025</p>');
  } catch (e) {
    res.send('Erro: ' + e.message);
  }
});

// ============================================
// DASHBOARD DO MINISTÉRIO
// ============================================
app.get('/admin-dashboard', (req, res) => {
  res.send('<!DOCTYPE html>' +
    '<html>' +
    '<head><meta charset="UTF-8"><title>Ministério - SNS</title>' +
    '<style>' +
    '*{margin:0;padding:0;box-sizing:border-box;font-family:Arial;}' +
    'body{display:flex;background:#f5f5f5;}' +
    '.sidebar{width:250px;background:#006633;color:white;height:100vh;padding:20px;position:fixed;}' +
    '.sidebar h2{margin-bottom:30px;}' +
    '.sidebar a{display:block;color:white;text-decoration:none;padding:10px;margin:5px 0;border-radius:5px;}' +
    '.sidebar a:hover{background:#004d26;}' +
    '.main{margin-left:270px;padding:30px;width:100%;}' +
    '.btn{background:#006633;color:white;border:none;padding:10px 20px;cursor:pointer;border-radius:5px;margin:5px;}' +
    '.btn:hover{background:#004d26;}' +
    '.btn-danger{background:#dc3545;}' +
    '.btn-success{background:#28a745;}' +
    'table{width:100%;background:white;border-collapse:collapse;margin-top:20px;}' +
    'th{background:#006633;color:white;padding:10px;text-align:left;}' +
    'td{padding:10px;border-bottom:1px solid #ddd;}' +
    '.badge{padding:3px 10px;border-radius:10px;font-size:12px;}' +
    '.badge-active{background:#d4edda;color:#155724;}' +
    '.badge-inactive{background:#f8d7da;color:#721c24;}' +
    '.modal{display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);align-items:center;justify-content:center;}' +
    '.modal-content{background:white;padding:20px;border-radius:10px;width:400px;}' +
    '.modal-content input{width:100%;padding:8px;margin:5px 0;border:1px solid #ddd;border-radius:5px;}' +
    '</style>' +
    '</head>' +
    '<body>' +
    '<div class="sidebar">' +
    '<h2>SNS - Ministério</h2>' +
    '<a href="#" onclick="mostrar(\'dashboard\')">📊 Dashboard</a>' +
    '<a href="#" onclick="mostrar(\'labs\')">🔬 Laboratórios</a>' +
    '<a href="#" onclick="mostrar(\'hospitais\')">🏥 Hospitais</a>' +
    '<a href="#" onclick="mostrar(\'empresas\')">🏢 Empresas</a>' +
    '<button onclick="logout()" class="btn btn-danger" style="margin-top:20px;width:100%;">Sair</button>' +
    '</div>' +
    '<div class="main">' +
    '<div id="dashboard">' +
    '<h2>Dashboard</h2>' +
    '<div style="display:flex;gap:20px;margin-top:20px;">' +
    '<div style="background:white;padding:20px;border-radius:10px;flex:1;text-align:center;"><h3>Laboratórios</h3><p style="font-size:24px;color:#006633;" id="totalLabs">0</p></div>' +
    '<div style="background:white;padding:20px;border-radius:10px;flex:1;text-align:center;"><h3>Hospitais</h3><p style="font-size:24px;color:#006633;" id="totalHosp">0</p></div>' +
    '<div style="background:white;padding:20px;border-radius:10px;flex:1;text-align:center;"><h3>Empresas</h3><p style="font-size:24px;color:#006633;" id="totalEmp">0</p></div>' +
    '</div>' +
    '</div>' +
    '<div id="labs" style="display:none;">' +
    '<h2>Laboratórios <button class="btn" onclick="abrirModal(\'lab\')">+ Novo</button></h2>' +
    '<table><thead><tr><th>Nome</th><th>NIF</th><th>Província</th><th>Status</th><th>Ações</th></tr></thead><tbody id="labTable"></tbody></table>' +
    '</div>' +
    '<div id="hospitais" style="display:none;">' +
    '<h2>Hospitais <button class="btn" onclick="abrirModal(\'hospital\')">+ Novo</button></h2>' +
    '<table><thead><tr><th>Nome</th><th>NIF</th><th>Província</th><th>Diretor</th><th>Status</th><th>Ações</th></tr></thead><tbody id="hospitalTable"></tbody></table>' +
    '</div>' +
    '<div id="empresas" style="display:none;">' +
    '<h2>Empresas <button class="btn" onclick="abrirModal(\'empresa\')">+ Nova</button></h2>' +
    '<table><thead><tr><th>Nome</th><th>NIF</th><th>Responsável</th><th>Status</th><th>Ações</th></tr></thead><tbody id="empresaTable"></tbody></table>' +
    '</div>' +
    '</div>' +
    '<div id="modalLab" class="modal">' +
    '<div class="modal-content">' +
    '<h3>Novo Laboratório</h3>' +
    '<input id="labNome" placeholder="Nome">' +
    '<input id="labNIF" placeholder="NIF (10 dígitos)" maxlength="10">' +
    '<input id="labProv" placeholder="Província">' +
    '<input id="labEmail" placeholder="Email">' +
    '<button class="btn" onclick="criarLab()">Criar</button>' +
    '<button class="btn btn-danger" onclick="fecharModal(\'modalLab\')">Cancelar</button>' +
    '</div></div>' +
    '<div id="modalHospital" class="modal">' +
    '<div class="modal-content">' +
    '<h3>Novo Hospital</h3>' +
    '<input id="hospNome" placeholder="Nome">' +
    '<input id="hospNIF" placeholder="NIF (10 dígitos)" maxlength="10">' +
    '<input id="hospProv" placeholder="Província">' +
    '<input id="hospDiretor" placeholder="Diretor">' +
    '<input id="hospEmail" placeholder="Email">' +
    '<button class="btn" onclick="criarHospital()">Criar</button>' +
    '<button class="btn btn-danger" onclick="fecharModal(\'modalHospital\')">Cancelar</button>' +
    '</div></div>' +
    '<div id="modalEmpresa" class="modal">' +
    '<div class="modal-content">' +
    '<h3>Nova Empresa</h3>' +
    '<input id="empNome" placeholder="Nome">' +
    '<input id="empNIF" placeholder="NIF (10 dígitos)" maxlength="10">' +
    '<input id="empResp" placeholder="Responsável">' +
    '<input id="empEmail" placeholder="Email">' +
    '<button class="btn" onclick="criarEmpresa()">Criar</button>' +
    '<button class="btn btn-danger" onclick="fecharModal(\'modalEmpresa\')">Cancelar</button>' +
    '</div></div>' +
    '<script>' +
    'const token=localStorage.getItem("token");' +
    'if(!token) window.location.href="/ministerio";' +
    'function mostrar(s){' +
    'document.getElementById("dashboard").style.display="none";' +
    'document.getElementById("labs").style.display="none";' +
    'document.getElementById("hospitais").style.display="none";' +
    'document.getElementById("empresas").style.display="none";' +
    'document.getElementById(s).style.display="block";' +
    'if(s==="labs") carregarLabs();' +
    'if(s==="hospitais") carregarHospitais();' +
    'if(s==="empresas") carregarEmpresas();' +
    '}' +
    'function abrirModal(t){' +
    'document.getElementById("modalLab").style.display="none";' +
    'document.getElementById("modalHospital").style.display="none";' +
    'document.getElementById("modalEmpresa").style.display="none";' +
    'if(t==="lab") document.getElementById("modalLab").style.display="flex";' +
    'if(t==="hospital") document.getElementById("modalHospital").style.display="flex";' +
    'if(t==="empresa") document.getElementById("modalEmpresa").style.display="flex";' +
    '}' +
    'function fecharModal(id){document.getElementById(id).style.display="none";}' +
    'async function carregarStats(){' +
    'const r=await fetch("/api/stats",{headers:{"Authorization":"Bearer "+token}});' +
    'const d=await r.json();' +
    'document.getElementById("totalLabs").innerText=d.labs||0;' +
    'document.getElementById("totalHosp").innerText=d.hospitais||0;' +
    'document.getElementById("totalEmp").innerText=d.empresas||0;' +
    '}' +
    'async function carregarLabs(){' +
    'const r=await fetch("/api/labs",{headers:{"Authorization":"Bearer "+token}});' +
    'const labs=await r.json();' +
    'let html="";' +
    'labs.forEach(l=>{html+="<tr><td>"+l.nome+"</td><td>"+l.nif+"</td><td>"+l.provincia+"</td><td><span class=\'badge "+(l.ativo?"badge-active":"badge-inactive")+"\'>"+(l.ativo?"Ativo":"Inativo")+"</span></td><td><button class=\'btn btn-success\' onclick=\'ativar(\\""+l._id+"\\",\\"lab\\")\' "+(l.ativo?"disabled":"")+">Ativar</button> <button class=\'btn btn-danger\' onclick=\'desativar(\\""+l._id+"\\",\\"lab\\")\' "+(l.ativo?"":"disabled")+">Desativar</button></td></tr>";});' +
    'document.getElementById("labTable").innerHTML=html;' +
    '}' +
    'async function carregarHospitais(){' +
    'const r=await fetch("/api/hospitais",{headers:{"Authorization":"Bearer "+token}});' +
    'const h=await r.json();' +
    'let html="";' +
    'h.forEach(i=>{html+="<tr><td>"+i.nome+"</td><td>"+i.nif+"</td><td>"+i.provincia+"</td><td>"+i.diretor+"</td><td><span class=\'badge "+(i.ativo?"badge-active":"badge-inactive")+"\'>"+(i.ativo?"Ativo":"Inativo")+"</span></td><td><button class=\'btn btn-success\' onclick=\'ativar(\\""+i._id+"\\",\\"hosp\\")\' "+(i.ativo?"disabled":"")+">Ativar</button> <button class=\'btn btn-danger\' onclick=\'desativar(\\""+i._id+"\\",\\"hosp\\")\' "+(i.ativo?"":"disabled")+">Desativar</button></td></tr>";});' +
    'document.getElementById("hospitalTable").innerHTML=html;' +
    '}' +
    'async function carregarEmpresas(){' +
    'const r=await fetch("/api/empresas",{headers:{"Authorization":"Bearer "+token}});' +
    'const e=await r.json();' +
    'let html="";' +
    'e.forEach(i=>{html+="<tr><td>"+i.nome+"</td><td>"+i.nif+"</td><td>"+i.responsavel.nome+"</td><td><span class=\'badge "+(i.ativo?"badge-active":"badge-inactive")+"\'>"+(i.ativo?"Ativo":"Inativo")+"</span></td><td><button class=\'btn btn-success\' onclick=\'ativar(\\""+i._id+"\\",\\"emp\\")\' "+(i.ativo?"disabled":"")+">Ativar</button> <button class=\'btn btn-danger\' onclick=\'desativar(\\""+i._id+"\\",\\"emp\\")\' "+(i.ativo?"":"disabled")+">Desativar</button></td></tr>";});' +
    'document.getElementById("empresaTable").innerHTML=html;' +
    '}' +
    'async function criarLab(){' +
    'const nif=document.getElementById("labNIF").value;' +
    'if(!/^\\d{10}$/.test(nif)){alert("NIF inválido");return;}' +
    'const dados={nome:document.getElementById("labNome").value,nif,provincia:document.getElementById("labProv").value,email:document.getElementById("labEmail").value,tipo:"laboratorio"};' +
    'const r=await fetch("/api/labs",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},body:JSON.stringify(dados)});' +
    'const d=await r.json();' +
    'if(d.success){alert("✅ Laboratório criado! API Key: "+d.apiKey);fecharModal("modalLab");carregarLabs();}' +
    'else alert("Erro: "+d.erro);' +
    '}' +
    'async function criarHospital(){' +
    'const nif=document.getElementById("hospNIF").value;' +
    'if(!/^\\d{10}$/.test(nif)){alert("NIF inválido");return;}' +
    'const dados={nome:document.getElementById("hospNome").value,nif,provincia:document.getElementById("hospProv").value,diretor:document.getElementById("hospDiretor").value,email:document.getElementById("hospEmail").value};' +
    'const r=await fetch("/api/hospitais",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},body:JSON.stringify(dados)});' +
    'const d=await r.json();' +
    'if(d.success){alert("✅ Hospital criado! Chave: "+d.chave);fecharModal("modalHospital");carregarHospitais();}' +
    'else alert("Erro: "+d.erro);' +
    '}' +
    'async function criarEmpresa(){' +
    'const nif=document.getElementById("empNIF").value;' +
    'if(!/^\\d{10}$/.test(nif)){alert("NIF inválido");return;}' +
    'const dados={nome:document.getElementById("empNome").value,nif,responsavel:{nome:document.getElementById("empResp").value},email:document.getElementById("empEmail").value};' +
    'const r=await fetch("/api/empresas",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},body:JSON.stringify(dados)});' +
    'const d=await r.json();' +
    'if(d.success){alert("✅ Empresa criada! Chave: "+d.chave);fecharModal("modalEmpresa");carregarEmpresas();}' +
    'else alert("Erro: "+d.erro);' +
    '}' +
    'async function ativar(id,t){' +
    'if(!confirm("Ativar?"))return;' +
    'const rota=t==="lab"?"/api/labs/"+id+"/ativar":t==="hosp"?"/api/hospitais/"+id+"/ativar":"/api/empresas/"+id+"/ativar";' +
    'await fetch(rota,{method:"POST",headers:{"Authorization":"Bearer "+token}});' +
    'if(t==="lab")carregarLabs();' +
    'if(t==="hosp")carregarHospitais();' +
    'if(t==="emp")carregarEmpresas();' +
    '}' +
    'async function desativar(id,t){' +
    'if(!confirm("Desativar?"))return;' +
    'const rota=t==="lab"?"/api/labs/"+id:t==="hosp"?"/api/hospitais/"+id:"/api/empresas/"+id;' +
    'await fetch(rota,{method:"DELETE",headers:{"Authorization":"Bearer "+token}});' +
    'if(t==="lab")carregarLabs();' +
    'if(t==="hosp")carregarHospitais();' +
    'if(t==="emp")carregarEmpresas();' +
    '}' +
    'function logout(){localStorage.removeItem("token");window.location.href="/";}' +
    'carregarStats();' +
    'mostrar("dashboard");' +
    '</script>' +
    '</body></html>');
});

// =============================================
// DASHBOARD DO LABORATORIO - VERSÃO FUNCIONAL
// =============================================
app.get('/lab-dashboard', (req, res) => {
  res.send('<!DOCTYPE html>' +
    '<html>' +
    '<head><meta charset="UTF-8"><title>Laboratório - SNS</title>' +
    '<style>' +
    '*{margin:0;padding:0;box-sizing:border-box;font-family:Arial;}' +
    'body{display:flex;background:#f5f5f5;}' +
    '.sidebar{width:250px;background:#006633;color:white;height:100vh;padding:20px;position:fixed;}' +
    '.sidebar h2{margin-bottom:30px;}' +
    '.sidebar a{display:block;color:white;text-decoration:none;padding:10px;margin:5px 0;border-radius:5px;cursor:pointer;}' +
    '.sidebar a:hover{background:#004d26;}' +
    '.main{margin-left:270px;padding:30px;width:100%;}' +
    '.welcome{background:#e8f5e9;padding:20px;border-left:5px solid #006633;margin-bottom:20px;}' +
    '.btn{background:#006633;color:white;border:none;padding:10px 20px;cursor:pointer;border-radius:5px;margin:5px;}' +
    '.btn:hover{background:#004d26;}' +
    '.btn-danger{background:#dc3545;color:white;border:none;padding:10px 20px;cursor:pointer;border-radius:5px;}' +
    '.btn-danger:hover{background:#c82333;}' +
    '.btn-pdf{background:#17a2b8;color:white;border:none;padding:5px 10px;border-radius:3px;cursor:pointer;font-size:12px;}' +
    '.btn-pdf:hover{background:#138496;}' +
    '.secao{display:none;}' +
    '.secao.ativa{display:block;}' +
    'table{width:100%;background:white;border-collapse:collapse;margin-top:20px;}' +
    'th{background:#006633;color:white;padding:10px;text-align:left;}' +
    'td{padding:10px;border-bottom:1px solid #ddd;}' +
    '</style>' +
    '</head>' +
    '<body>' +
    '<div class="sidebar">' +
    '<h2>SNS - Laboratório</h2>' +
    '<a onclick="mostrar(\'dashboard\')">📊 Dashboard</a>' +
    '<a onclick="mostrar(\'certificados\')">📋 Certificados</a>' +
    '<button onclick="logout()" class="btn btn-danger" style="margin-top:20px;width:100%;">Sair</button>' +
    '</div>' +
    '<div class="main">' +
    '<div id="welcome" class="welcome"></div>' +
    '<div id="secaoDashboard" class="secao ativa">' +
    '<h2>Dashboard</h2>' +
    '<p>Total de certificados emitidos: <span id="total">0</span></p>' +
    '</div>' +
    '<div id="secaoCertificados" class="secao">' +
    '<h2>Certificados</h2>' +
    '<button class="btn" onclick="window.location.href=\'/novo-certificado\'">+ Novo Certificado</button>' +
    '<table><thead><tr><th>Número</th><th>Tipo</th><th>Paciente</th><th>Data</th><th>Ações</th></tr></thead><tbody id="tabela"><tr><td colspan="5">Carregando...</td></tr></tbody></table>' +
    '</div>' +
    '</div>' +
    '<script>' +
    'const key = localStorage.getItem("labKey");' +
    'if(!key) window.location.href = "/lab-login";' +
    
    'async function carregarLab(){' +
    '  try{' +
    '    const r = await fetch("/api/labs/me",{headers:{"x-api-key":key}});' +
    '    const d = await r.json();' +
    '    if(d && d.nome){' +
    '      document.getElementById("welcome").innerHTML = "<h2>Olá, " + d.nome + "!</h2><p>Pronto para mais um dia de trabalho? Vamos juntos!</p>";' +
    '    }' +
    '  } catch(e){}' +
    '}' +
    
    'function mostrar(secao){' +
    '  document.getElementById("secaoDashboard").classList.remove("ativa");' +
    '  document.getElementById("secaoCertificados").classList.remove("ativa");' +
    '  if(secao === "dashboard") document.getElementById("secaoDashboard").classList.add("ativa");' +
    '  if(secao === "certificados"){' +
    '    document.getElementById("secaoCertificados").classList.add("ativa");' +
    '    carregarCertificados();' +
    '  }' +
    '}' +
    
    'async function carregarCertificados(){' +
    '  try{' +
    '    const r = await fetch("/api/certificados/lab",{headers:{"x-api-key":key}});' +
    '    const lista = await r.json();' +
    '    document.getElementById("total").innerText = lista.length;' +
    '    let html = "";' +
    '    if(lista.length === 0){' +
    '      html = "<tr><td colspan=\'5\'>Nenhum certificado encontrado</td></tr>";' +
    '    } else {' +
    '      const tipos = ["","GENÓTIPO","BOA SAÚDE","INCAPACIDADE","APTIDÃO","SAÚDE MATERNA","PRÉ-NATAL","EPIDEMIOLÓGICO"];' +
    '      lista.forEach(c => {' +
    '        html += "<tr><td>" + c.numero + "</td><td>" + (tipos[c.tipo] || "Tipo "+c.tipo) + "</td><td>" + (c.paciente?.nomeCompleto || "N/A") + "</td><td>" + new Date(c.emitidoEm).toLocaleDateString() + "</td><td><button class=\'btn-pdf\' onclick=\'alert(\\"PDF de " + c.numero + "\\")\'>📄 PDF</button></td></tr>";' +
    '      });' +
    '    }' +
    '    document.getElementById("tabela").innerHTML = html;' +
    '  } catch(e){' +
    '    document.getElementById("tabela").innerHTML = "<tr><td colspan=\'5\'>Erro ao carregar</td></tr>";' +
    '  }' +
    '}' +
    
    'function logout(){' +
    '  localStorage.removeItem("labKey");' +
    '  window.location.href = "/";' +
    '}' +
    
    'carregarLab();' +
    'carregarCertificados();' +
    'mostrar("dashboard");' +
    '</script>' +
    '</body></html>');
});
// ================================================
// API DE LABORATÓRIOS
// ================================================
app.post('/api/labs', authMiddleware, async (req, res) => {
  try {
    const dados = req.body;
    if (!dados.nif || !validarNIF(dados.nif)) {
      return res.status(400).json({ erro: 'NIF inválido' });
    }
    const labId = 'LAB-' + Date.now();
    const apiKey = gerarApiKey();
    const lab = new Lab({ ...dados, labId, apiKey });
    await lab.save();
    res.json({ success: true, labId, apiKey });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ erro: 'NIF já cadastrado' });
    res.status(500).json({ erro: 'Erro ao criar laboratório' });
  }
});

app.get('/api/labs', authMiddleware, async (req, res) => {
  try {
    const labs = await Lab.find({}, { apiKey: 0 });
    res.json(labs);
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao buscar laboratórios' });
  }
});

app.get('/api/labs/me', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  const lab = await Lab.findOne({ apiKey }, { apiKey: 0 });
  res.json(lab);
});

app.delete('/api/labs/:id', authMiddleware, async (req, res) => {
  try {
    await Lab.findByIdAndUpdate(req.params.id, { ativo: false });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ erro: 'Erro interno' });
  }
});

app.post('/api/labs/:id/ativar', authMiddleware, async (req, res) => {
  try {
    await Lab.findByIdAndUpdate(req.params.id, { ativo: true });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// ===================================================
// API DE CERTIFICADOS
// ===================================================
app.get('/api/certificados/lab', labMiddleware, async (req, res) => {
  try {
    const certificados = await Certificate.find({ emitidoPor: req.lab._id })
      .sort({ emitidoEm: -1 })
      .limit(100);
    res.json(certificados);
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao buscar certificados' });
  }
});

app.post('/api/certificados/emitir/:tipo', labMiddleware, async (req, res) => {
  try {
    const tipo = parseInt(req.params.tipo);
    if (tipo < 1 || tipo > 7) {
      return res.status(400).json({ erro: 'Tipo de certificado inválido' });
    }
    const dados = req.body;
    if (!dados.paciente || !dados.paciente.nomeCompleto || !dados.paciente.bi) {
      return res.status(400).json({ erro: 'Dados do paciente incompletos' });
    }
    const numero = gerarNumeroCertificado(tipo);
    const hash = crypto.createHash('sha256').update(numero + JSON.stringify(dados) + Date.now()).digest('hex');
    const certificado = new Certificate({
      numero,
      tipo,
      paciente: dados.paciente,
      dados: dados.dados || {},
      hash,
      emitidoPor: req.lab._id
    });
    await certificado.save();
    req.lab.totalEmissoes++;
    await req.lab.save();
    res.json({ success: true, numero, hash });
  } catch (error) {
    res.status(500).json({ erro: 'Erro interno: ' + error.message });
  }
});

// ==============================================
// API DE HOSPITAIS E EMPRESAS
// ==============================================
app.post('/api/hospitais', authMiddleware, async (req, res) => {
  try {
    const dados = req.body;
    if (!dados.nif || !validarNIF(dados.nif)) {
      return res.status(400).json({ erro: 'NIF inválido' });
    }
    const chave = gerarChaveAcesso('hospital');
    const hospital = new Hospital({ ...dados, chaveAcesso: chave });
    await hospital.save();
    res.json({ success: true, chave });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ erro: 'NIF já cadastrado' });
    res.status(500).json({ erro: 'Erro ao criar hospital' });
  }
});

app.get('/api/hospitais', authMiddleware, async (req, res) => {
  try {
    const hospitais = await Hospital.find({}, { chaveAcesso: 0 });
    res.json(hospitais);
  } catch (error) {
    res.status(500).json({ erro: 'Erro interno' });
  }
});

app.post('/api/empresas', authMiddleware, async (req, res) => {
  try {
    const dados = req.body;
    if (!dados.nif || !validarNIF(dados.nif)) {
      return res.status(400).json({ erro: 'NIF inválido' });
    }
    const chave = gerarChaveAcesso('empresa');
    const empresa = new Empresa({ ...dados, chaveAcesso: chave });
    await empresa.save();
    res.json({ success: true, chave });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ erro: 'NIF já cadastrado' });
    res.status(500).json({ erro: 'Erro ao criar empresa' });
  }
});

app.get('/api/empresas', authMiddleware, async (req, res) => {
  try {
    const empresas = await Empresa.find({}, { chaveAcesso: 0 });
    res.json(empresas);
  } catch (error) {
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// ==============================================
// ESTATÍSTICAS
// ==============================================
app.get('/api/stats', authMiddleware, async (req, res) => {
  try {
    const stats = {
      labs: await Lab.countDocuments({ ativo: true }),
      hospitais: await Hospital.countDocuments({ ativo: true }),
      empresas: await Empresa.countDocuments({ ativo: true })
    };
    res.json(stats);
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// =============================================
// ROTA DO FORMULÁRIO DE CERTIFICADO
// =============================================
app.get('/novo-certificado', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'novo-certificado.html'));
});

app.listen(PORT, () => {
  console.log('\n' + '='.repeat(50));
  console.log('SNS - SISTEMA NACIONAL DE SAÚDE');
  console.log('='.repeat(50));
  console.log('✅ URL: http://localhost:' + PORT);
  console.log('✅ Ministério: /ministerio (admin@sns.gov.ao / Admin@2025)');
  console.log('✅ Laboratório: /lab-login (com API Key)');
  console.log('='.repeat(50) + '\n');
});
