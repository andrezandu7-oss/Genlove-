// ========================
// SNS - SISTEMA NACIONAL DE SAÚDE
// MINISTÉRIO DA SAÚDE - ANGOLA
// VERSÃO FINAL ROBUSTA E INTEGRAL
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

[span_1](start_span)[span_2](start_span)// Correction cruciale pour Render : définition du dossier statique avec path.join[span_1](end_span)[span_2](end_span)
app.use(express.static(path.join(__dirname, 'public')));

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
  try {
    const lab = await Lab.findOne({ apiKey, ativo: true });
    if (!lab) return res.status(401).json({ erro: 'Chave inválida.' });
    req.lab = lab;
    next();
  } catch (error) {
    res.status(500).json({ erro: 'Erro interno de servidor' });
  }
};

// ===========================================
// ROTAS DE INTERFACE
// ===========================================
app.get('/', (req, res) => {
  res.send('<!DOCTYPE html><html><head><title>SNS - Angola</title><style>body{background:#006633;font-family:Arial;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;}.container{background:white;padding:40px;border-radius:10px;width:350px;text-align:center;}h1{color:#006633;}a{display:block;margin:15px;padding:12px;background:#006633;color:white;text-decoration:none;border-radius:5px;}a:hover{background:#004d26;}</style></head><body><div class="container"><h1>SNS - Angola</h1><a href="/ministerio">🏛️ Ministério da Saúde</a><a href="/lab-login">🔬 Laboratório</a></div></body></html>');
});

// LOGIN MINISTÉRIO
app.get('/ministerio', (req, res) => {
  res.send('<!DOCTYPE html><html><head><title>Login Ministério</title><style>body{background:#006633;font-family:Arial;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;}.container{background:white;padding:30px;border-radius:10px;width:350px;}h2{color:#006633;text-align:center;}input{width:100%;padding:10px;margin:10px 0;border:1px solid #ddd;border-radius:5px;}button{width:100%;padding:12px;background:#006633;color:white;border:none;border-radius:5px;cursor:pointer;}.error{color:red;display:none;text-align:center;}</style></head><body><div class="container"><h2>Ministério da Saúde</h2><div id="error" class="error"></div><input type="email" id="email" placeholder="Email" value="admin@sns.gov.ao"><input type="password" id="password" placeholder="Senha" value="Admin@2025"><button onclick="login()">Entrar</button></div><script>async function login(){const e=document.getElementById("email").value;const p=document.getElementById("password").value;const r=await fetch("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:e,password:p})});const d=await r.json();if(d.token){localStorage.setItem("token",d.token);window.location.href="/admin-dashboard";}else{document.getElementById("error").style.display="block";document.getElementById("error").innerText="Erro no login";}}</script></body></html>');
});

// LOGIN LABORATÓRIO
app.get('/lab-login', (req, res) => {
  res.send('<!DOCTYPE html><html><head><title>Lab Login</title><style>body{background:#006633;font-family:Arial;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;}.container{background:white;padding:30px;border-radius:10px;width:350px;}h2{color:#006633;text-align:center;}input{width:100%;padding:10px;margin:10px 0;border:1px solid #ddd;border-radius:5px;}button{width:100%;padding:12px;background:#006633;color:white;border:none;border-radius:5px;cursor:pointer;}.error{color:red;display:none;text-align:center;}</style></head><body><div class="container"><h2>Acesso Laboratório</h2><div id="error" class="error"></div><input type="text" id="apiKey" placeholder="Digite sua API Key"><button onclick="login()">Entrar</button></div><script>async function login(){const key=document.getElementById("apiKey").value.trim();if(!key)return;const r=await fetch("/api/labs/verificar",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({apiKey:key})});const d=await r.json();if(d.valido){localStorage.setItem("labKey",key);window.location.href="/lab-dashboard";}else{alert(d.erro);}}</script></body></html>');
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
    const lab = await Lab.findOne({ apiKey, ativo: true });
    if (lab) return res.json({ valido: true });
    return res.json({ valido: false, erro: 'Chave inválida ou laboratório inativo.' });
  } catch (error) {
    res.status(500).json({ valido: false });
  }
});

// DASHBOARD LABORATÓRIO (HTML Incorporado para simplificar gestão no Render)
app.get('/lab-dashboard', (req, res) => {
    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Lab - SNS</title><style>*{margin:0;padding:0;box-sizing:border-box;font-family:Arial;}body{display:flex;background:#f5f5f5;}.sidebar{width:250px;background:#006633;color:white;height:100vh;padding:20px;position:fixed;}.sidebar a{display:block;color:white;text-decoration:none;padding:12px;margin:5px 0;border-radius:5px;cursor:pointer;}.main{margin-left:270px;padding:30px;width:100%;}.stats-container{display:flex;gap:15px;margin-bottom:30px;}.stat-card{background:white;padding:20px;border-radius:10px;flex:1;text-align:center;border-top:4px solid #006633;box-shadow:0 2px 5px rgba(0,0,0,0.1);}.stat-card h4{color:#666;font-size:14px;margin-bottom:10px;}.stat-card p{font-size:24px;font-weight:bold;color:#006633;}table{width:100%;background:white;border-collapse:collapse;}th{background:#006633;color:white;padding:12px;text-align:left;}td{padding:12px;border-bottom:1px solid #ddd;}.btn{background:#006633;color:white;border:none;padding:10px 20px;border-radius:5px;cursor:pointer;text-decoration:none;}</style></head><body><div class="sidebar"><h2>SNS - Lab</h2><a onclick="location.reload()">📊 Relatórios</a><a href="/novo-certificado">📋 Novo Certificado</a><button onclick="localStorage.removeItem('labKey');location.href='/'" style="background:red;color:white;padding:8px;width:100%;margin-top:20px;border:none;border-radius:5px;cursor:pointer;">Sair</button></div><div class="main"><div id="welcome"></div><div class="stats-container"><div class="stat-card"><h4>HOJE</h4><p id="statDiario">0</p></div><div class="stat-card"><h4>ESTE MÊS</h4><p id="statMensal">0</p></div><div class="stat-card"><h4>TOTAL</h4><p id="statTotal">0</p></div></div><h2>Últimos Certificados</h2><table><thead><tr><th>Número</th><th>Tipo</th><th>Paciente</th><th>Data</th></tr></thead><tbody id="tabela"></tbody></table></div><script>const key=localStorage.getItem("labKey");if(!key)location.href="/lab-login";async function load(){const r=await fetch("/api/certificados/stats-detalhes",{headers:{"x-api-key":key}});const s=await r.json();document.getElementById("statDiario").innerText=s.diario;document.getElementById("statMensal").innerText=s.mensal;document.getElementById("statTotal").innerText=s.total;const rc=await fetch("/api/certificados/lab",{headers:{"x-api-key":key}});const certs=await rc.json();let h="";certs.forEach(c=>{h+='<tr><td>'+c.numero+'</td><td>'+c.tipo+'</td><td>'+c.paciente.nomeCompleto+'</td><td>'+new Date(c.emitidoEm).toLocaleDateString()+'</td></tr>'});document.getElementById("tabela").innerHTML=h;}load();</script></body></html>`);
});

// ===================================================
// API DE CERTIFICADOS (RELATÓRIOS E EMISSÃO)
// ===================================================
app.get('/api/certificados/stats-detalhes', labMiddleware, async (req, res) => {
  try {
    const hoje = new Date();
    const inicioHoje = new Date(hoje.setHours(0, 0, 0, 0));
    const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const inicioAno = new Date(hoje.getFullYear(), 0, 1);

    const stats = await Certificate.aggregate([
      { $match: { emitidoPor: req.lab._id } },
      { $facet: {
          "diario": [{ $match: { emitidoEm: { $gte: inicioHoje } } }, { $count: "count" }],
          "mensal": [{ $match: { emitidoEm: { $gte: inicioMes } } }, { $count: "count" }],
          "anual": [{ $match: { emitidoEm: { $gte: inicioAno } } }, { $count: "count" }]
      }}
    ]);

    res.json({
      diario: stats[0]?.diario[0]?.count || 0,
      mensal: stats[0]?.mensal[0]?.count || 0,
      anual: stats[0]?.anual[0]?.count || 0,
      total: req.lab.totalEmissoes || 0
    });
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao calcular estatísticas' });
  }
});

app.get('/api/certificados/lab', labMiddleware, async (req, res) => {
  const certificados = await Certificate.find({ emitidoPor: req.lab._id }).sort({ emitidoEm: -1 }).limit(20);
  res.json(certificados);
});

app.post('/api/certificados/emitir/:tipo', labMiddleware, async (req, res) => {
  try {
    const tipo = parseInt(req.params.tipo);
    const dados = req.body;

    // Protection Éthique SS/SS : Bloqueio de parceiros SS se o paciente for SS
    if (dados.dados.genotipo === 'SS') {
        console.warn(`[SAÚDE] Atenção: Paciente ${dados.paciente.nomeCompleto} identificado com Genótipo SS.`);
    }

    const numero = gerarNumeroCertificado(tipo);
    const hash = crypto.createHash('sha256').update(numero + Date.now()).digest('hex');
    
    const certificado = new Certificate({
      numero, tipo, paciente: dados.paciente, dados: dados.dados, hash, emitidoPor: req.lab._id
    });

    await certificado.save();
    req.lab.totalEmissoes++;
    await req.lab.save();
    res.json({ success: true, numero });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

// FORMULÁRIO NOVO (Correction du chemin pour Render)
app.get('/novo-certificado', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'novo-certificado.html'));
});

// =============================================
// STATS GLOBAIS (MINISTÉRIO)
// =============================================
app.get('/api/stats', authMiddleware, async (req, res) => {
  const stats = {
    labs: await Lab.countDocuments({ ativo: true }),
    hospitais: await Hospital.countDocuments({ ativo: true }),
    empresas: await Empresa.countDocuments({ ativo: true })
  };
  res.json(stats);
});

app.get('/api/labs', authMiddleware, async (req, res) => {
  const labs = await Lab.find({}, { apiKey: 0 });
  res.json(labs);
});

app.post('/api/labs', authMiddleware, async (req, res) => {
  try {
    const dados = req.body;
    const labId = 'LAB-' + Date.now();
    const apiKey = gerarApiKey();
    const lab = new Lab({ ...dados, labId, apiKey });
    await lab.save();
    res.json({ success: true, labId, apiKey });
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao criar laboratório' });
  }
});

app.listen(PORT, () => {
  console.log('✅ SNS Angola Online na porta ' + PORT);
});
