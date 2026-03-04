// ========================
// SNS - SISTEMA NACIONAL DE SAÚDE
// MINISTÉRIO DA SAÚDE - ANGOLA
// VERSÃO FINAL COM RELATÓRIOS DETALHADOS
// ========================
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const crypto = require('crypto');
const PDFDocument = require('pdfkit');
const path = require('path');
const QRCode = require('qrcode');
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
  if (!lab) return res.status(401).json({ erro: 'Chave inválida.' });
  req.lab = lab;
  next();
};

// ===========================================
// ROTAS PÚBLICAS
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

// ============================================
// DASHBOARD DO MINISTÉRIO
// ============================================
app.get('/admin-dashboard', (req, res) => {
  res.send('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Admin - SNS</title><style>*{margin:0;padding:0;box-sizing:border-box;font-family:Arial;}body{display:flex;background:#f5f5f5;}.sidebar{width:250px;background:#006633;color:white;height:100vh;padding:20px;position:fixed;}.sidebar a{display:block;color:white;text-decoration:none;padding:10px;margin:5px 0;border-radius:5px;cursor:pointer;}.sidebar a:hover{background:#004d26;}.main{margin-left:270px;padding:30px;width:100%;}.btn{background:#006633;color:white;border:none;padding:10px 20px;cursor:pointer;border-radius:5px;}.modal{display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);align-items:center;justify-content:center;}.modal-content{background:white;padding:20px;border-radius:10px;width:400px;}table{width:100%;background:white;border-collapse:collapse;margin-top:20px;}th{background:#006633;color:white;padding:10px;}td{padding:10px;border-bottom:1px solid #ddd;}</style></head><body><div class="sidebar"><h2>SNS - Admin</h2><a onclick="mostrar(\'dashboard\')">📊 Dashboard</a><a onclick="mostrar(\'labs\')">🔬 Laboratórios</a><button onclick="logout()" class="btn" style="background:red;width:100%;margin-top:20px;">Sair</button></div><div class="main"><div id="dashboard"><h2>Painel de Controle</h2><p id="stats">Carregando estatísticas...</p></div><div id="labs" style="display:none;"><h2>Laboratórios <button class="btn" onclick="document.getElementById(\'modalLab\').style.display=\'flex\'">+ Novo</button></h2><table><thead><tr><th>Nome</th><th>NIF</th><th>Status</th><th>Ações</th></tr></thead><tbody id="labTable"></tbody></table></div></div><div id="modalLab" class="modal"><div class="modal-content"><h3>Novo Laboratório</h3><input id="lNome" style="width:100%;margin:5px 0;padding:8px;" placeholder="Nome"><input id="lNIF" style="width:100%;margin:5px 0;padding:8px;" placeholder="NIF"><input id="lProv" style="width:100%;margin:5px 0;padding:8px;" placeholder="Província"><input id="lEmail" style="width:100%;margin:5px 0;padding:8px;" placeholder="Email"><button class="btn" onclick="criarLab()">Criar</button><button class="btn" style="background:gray;" onclick="document.getElementById(\'modalLab\').style.display=\'none\'">Cancelar</button></div></div><script>const token=localStorage.getItem("token");if(!token)window.location.href="/ministerio";function mostrar(id){document.getElementById("dashboard").style.display=id==="dashboard"?"block":"none";document.getElementById("labs").style.display=id==="labs"?"block":"none";if(id==="labs")carregarLabs();}async function carregarLabs(){const r=await fetch("/api/labs",{headers:{"Authorization":"Bearer "+token}});const labs=await r.json();let html="";labs.forEach(l=>{html+=`<tr><td>${l.nome}</td><td>${l.nif}</td><td>${l.ativo?"Ativo":"Inativo"}</td><td><button onclick="ativar(\'${l._id}\',${!l.ativo})">${l.ativo?"Desativar":"Ativar"}</button></td></tr>`});document.getElementById("labTable").innerHTML=html;}async function criarLab(){const d={nome:document.getElementById("lNome").value,nif:document.getElementById("lNIF").value,provincia:document.getElementById("lProv").value,email:document.getElementById("lEmail").value,tipo:"laboratorio"};const r=await fetch("/api/labs",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},body:JSON.stringify(d)});const res=await r.json();if(res.success){alert("API Key: "+res.apiKey);location.reload();}}function logout(){localStorage.removeItem("token");location.href="/";}</script></body></html>');
});

// =============================================
// DASHBOARD DO LABORATORIO (AVEC RAPPORTS)
// =============================================
app.get('/lab-dashboard', (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Laboratório - SNS</title>
    <style>
        *{margin:0;padding:0;box-sizing:border-box;font-family:Arial;}
        body{display:flex;background:#f5f5f5;}
        .sidebar{width:250px;background:#006633;color:white;height:100vh;padding:20px;position:fixed;}
        .sidebar h2{margin-bottom:30px;}
        .sidebar a{display:block;color:white;text-decoration:none;padding:12px;margin:5px 0;border-radius:5px;cursor:pointer;}
        .sidebar a:hover{background:#004d26;}
        .main{margin-left:270px;padding:30px;width:100%;}
        .welcome{background:#e8f5e9;padding:20px;border-left:5px solid #006633;margin-bottom:20px;}
        .btn{background:#006633;color:white;border:none;padding:10px 20px;cursor:pointer;border-radius:5px;}
        .btn-danger{background:#dc3545;}
        .secao{display:none;}
        .secao.ativa{display:block;}
        .card-container{display:flex; gap:15px; margin-top:20px; margin-bottom:30px;}
        .card{background:white; padding:20px; border-radius:10px; flex:1; border-top:4px solid #006633; box-shadow: 0 2px 5px rgba(0,0,0,0.1); text-align:center;}
        .card h4{color:#666; font-size:14px; text-transform:uppercase; margin-bottom:10px;}
        .card p{font-size:28px; font-weight:bold; color:#006633;}
        table{width:100%;background:white;border-collapse:collapse;margin-top:20px;}
        th{background:#006633;color:white;padding:12px;text-align:left;}
        td{padding:12px;border-bottom:1px solid #ddd;}
    </style>
</head>
<body>
    <div class="sidebar">
        <h2>SNS - Lab</h2>
        <a onclick="mostrar('dashboard')">📊 Relatórios</a>
        <a onclick="mostrar('certificados')">📋 Meus Certificados</a>
        <button onclick="logout()" class="btn btn-danger" style="margin-top:20px;width:100%;">Sair</button>
    </div>
    <div class="main">
        <div id="welcome" class="welcome"></div>
        
        <div id="secaoDashboard" class="secao ativa">
            <h2>Relatórios de Emissão</h2>
            <div class="card-container">
                <div class="card"><h4>Hoje</h4><p id="statDiario">0</p></div>
                <div class="card"><h4>Este Mês</h4><p id="statMensal">0</p></div>
                <div class="card"><h4>Este Ano</h4><p id="statAnual">0</p></div>
                <div class="card" style="border-top-color:#ffa500;"><h4>Total Geral</h4><p id="statTotal" style="color:#ffa500;">0</p></div>
            </div>
        </div>

        <div id="secaoCertificados" class="secao">
            <h2>Certificados <button class="btn" style="float:right;" onclick="window.location.href='/novo-certificado'">+ Novo</button></h2>
            <table>
                <thead><tr><th>Número</th><th>Tipo</th><th>Paciente</th><th>Data</th></tr></thead>
                <tbody id="tabela"></tbody>
            </table>
        </div>
    </div>

    <script>
        const key = localStorage.getItem("labKey");
        if(!key) window.location.href = "/lab-login";

        async function carregarDados() {
            try {
                // 1. Carregar Perfil
                const rMe = await fetch("/api/labs/me", {headers:{"x-api-key":key}});
                const dMe = await rMe.json();
                document.getElementById("welcome").innerHTML = "<h2>Bem-vindo, " + dMe.nome + "</h2>";

                // 2. Carregar Estatísticas (Relatórios)
                const rStats = await fetch("/api/certificados/stats-detalhes", {headers:{"x-api-key":key}});
                const dStats = await rStats.json();
                document.getElementById("statDiario").innerText = dStats.diario;
                document.getElementById("statMensal").innerText = dStats.mensal;
                document.getElementById("statAnual").innerText = dStats.anual;
                document.getElementById("statTotal").innerText = dStats.total;

                // 3. Carregar Tabela
                const rCert = await fetch("/api/certificados/lab", {headers:{"x-api-key":key}});
                const lista = await rCert.json();
                const tipos = ["","GENÓTIPO","BOA SAÚDE","INCAPACIDADE","APTIDÃO","SAÚDE MATERNA","PRÉ-NATAL","EPIDEMIOLÓGICO"];
                let html = "";
                lista.forEach(c => {
                    html += "<tr><td>"+c.numero+"</td><td>"+tipos[c.tipo]+"</td><td>"+c.paciente.nomeCompleto+"</td><td>"+new Date(c.emitidoEm).toLocaleDateString()+"</td></tr>";
                });
                document.getElementById("tabela").innerHTML = html || "<tr><td colspan='4'>Nenhum certificado.</td></tr>";
            } catch(e) { console.error(e); }
        }

        function mostrar(s) {
            document.getElementById("secaoDashboard").classList.remove("ativa");
            document.getElementById("secaoCertificados").classList.remove("ativa");
            if(s === "dashboard") document.getElementById("secaoDashboard").classList.add("ativa");
            if(s === "certificados") document.getElementById("secaoCertificados").classList.add("ativa");
        }

        function logout(){ localStorage.removeItem("labKey"); window.location.href="/"; }
        carregarDados();
    </script>
</body>
</html>`);
});

// ================================================
// API DE LABORATÓRIOS
// ================================================
app.get('/api/labs/me', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  const lab = await Lab.findOne({ apiKey }, { apiKey: 0 });
  res.json(lab);
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
    res.status(500).json({ erro: 'Erro ao criar' });
  }
});

app.get('/api/labs', authMiddleware, async (req, res) => {
  const labs = await Lab.find({}, { apiKey: 0 });
  res.json(labs);
});

// ===================================================
// API DE CERTIFICADOS (INCLUINDO STATS DETALHES)
// ===================================================
app.get('/api/certificados/stats-detalhes', labMiddleware, async (req, res) => {
  try {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const inicioAno = new Date(hoje.getFullYear(), 0, 1);

    const stats = await Certificate.aggregate([
      { $match: { emitidoPor: req.lab._id } },
      {
        $facet: {
          "diario": [{ $match: { emitidoEm: { $gte: hoje } } }, { $count: "count" }],
          "mensal": [{ $match: { emitidoEm: { $gte: inicioMes } } }, { $count: "count" }],
          "anual": [{ $match: { emitidoEm: { $gte: inicioAno } } }, { $count: "count" }]
        }
      }
    ]);

    res.json({
      diario: stats[0].diario[0]?.count || 0,
      mensal: stats[0].mensal[0]?.count || 0,
      anual: stats[0].anual[0]?.count || 0,
      total: req.lab.totalEmissoes
    });
  } catch (error) {
    res.status(500).json({ erro: 'Erro' });
  }
});

app.get('/api/certificados/lab', labMiddleware, async (req, res) => {
  const certificados = await Certificate.find({ emitidoPor: req.lab._id }).sort({ emitidoEm: -1 });
  res.json(certificados);
});

app.post('/api/certificados/emitir/:tipo', labMiddleware, async (req, res) => {
  try {
    const tipo = parseInt(req.params.tipo);
    const dados = req.body;
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

// FORMULÁRIO NOVO
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

app.listen(PORT, () => {
  console.log('✅ SNS Online na porta ' + PORT);
});

