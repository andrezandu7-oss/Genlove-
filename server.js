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

// Route pour générer PDF
app.post('/api/certificados/pdf', labMiddleware, async (req, res) => {
    try {
        const { numero, dados } = req.body;
        
        // Récupérer les informations du laboratoire depuis le middleware
        const lab = req.lab;
        
        // Créer un nouveau document PDF
        const doc = new PDFDocument({
            size: 'A4',
            margin: 50,
            info: {
                Title: `Certificado ${numero}`,
                Author: lab.nome,
                Subject: 'Certificado Médico SNS Angola'
            }
        });
        
        // Configurer la réponse
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=certificado-${numero}.pdf`);
        
        // Pipe le PDF vers la réponse
        doc.pipe(res);
        
        // En-tête du document
        doc.image('public/logo-sns.png', 50, 45, { width: 100 })
            .fillColor('#006633')
            .fontSize(20)
            .text('REPÚBLICA DE ANGOLA', 170, 50)
            .fontSize(16)
            .text('MINISTÉRIO DA SAÚDE', 170, 75)
            .fontSize(24)
            .text('SISTEMA NACIONAL DE SAÚDE', 170, 100)
            .moveDown();
        
        // Ligne de séparation
        doc.strokeColor('#006633')
            .lineWidth(2)
            .moveTo(50, 150)
            .lineTo(550, 150)
            .stroke();
        
        // Numéro du certificat
        doc.fillColor('#006633')
            .fontSize(14)
            .text(`CERTIFICADO Nº: ${numero}`, 50, 170)
            .fontSize(10)
            .fillColor('#666')
            .text(`Emissão: ${new Date(dados.dataEmissao).toLocaleDateString('pt-PT')}`, 50, 190)
            .moveDown();
        
        // ===== INFORMATIONS DU LABORATOIRE (depuis l'API key) =====
        doc.fillColor('#006633')
            .fontSize(12)
            .text('LABORATÓRIO EMISSOR:', 50, 220);
        
        doc.fillColor('#000')
            .fontSize(11)
            .text(`${lab.nome}`, 70, 240)
            .text(`NIF: ${lab.nif}`, 70, 255)
            .text(`Endereço: ${lab.endereco || 'Endereço não informado'}`, 70, 270)
            .text(`${lab.provincia} - Angola`, 70, 285)
            .text(`Tel: ${lab.telephone || 'Não informado'}`, 70, 300)
            .text(`Email: ${lab.email || 'Não informado'}`, 70, 315)
            .moveDown();
        
        let y = 340;
        
        // ===== RESPONSÁVEL PELA EMISSÃO (laborantin) =====
        doc.fillColor('#006633')
            .fontSize(12)
            .text('RESPONSÁVEL PELA EMISSÃO:', 50, y);
        
        y += 20;
        doc.fillColor('#000')
            .fontSize(11)
            .text(`Nome: ${dados.laborantin.nome}`, 70, y);
        
        y += 15;
        if (dados.laborantin.registro) {
            doc.text(`Registro Profissional: ${dados.laborantin.registro}`, 70, y);
            y += 25;
        } else {
            y += 10;
        }
        
        // ===== DADOS DO PACIENTE =====
        doc.fillColor('#006633')
            .fontSize(12)
            .text('DADOS DO PACIENTE:', 50, y);
        
        y += 20;
        doc.fillColor('#000')
            .fontSize(11)
            .text(`Nome: ${dados.paciente.nomeCompleto}`, 70, y);
        
        y += 15;
        doc.text(`BI: ${dados.paciente.bi}`, 70, y);
        
        y += 15;
        if (dados.paciente.dataNascimento) {
            doc.text(`Data Nascimento: ${new Date(dados.paciente.dataNascimento).toLocaleDateString('pt-PT')}`, 70, y);
            y += 15;
        }
        
        if (dados.paciente.genero) {
            const genero = dados.paciente.genero === 'M' ? 'Masculino' : 'Feminino';
            doc.text(`Género: ${genero}`, 70, y);
            y += 15;
        }
        
        if (dados.paciente.telefone) {
            doc.text(`Telefone: ${dados.paciente.telefone}`, 70, y);
            y += 15;
        }
        
        y += 10;
        
        // ===== DADOS MÉDICOS =====
        doc.fillColor('#006633')
            .fontSize(12)
            .text('DADOS MÉDICOS:', 50, y);
        
        y += 20;
        
        // Titre du type de certificat
        const tipos = {
            1: 'CERTIFICADO DE GENÓTIPO',
            2: 'CERTIFICADO DE BOA SAÚDE',
            3: 'CERTIFICADO DE INCAPACIDADE',
            4: 'CERTIFICADO DE APTIDÃO',
            5: 'CERTIFICADO DE SAÚDE MATERNA',
            6: 'CERTIFICADO DE PRÉ-NATAL',
            7: 'CERTIFICADO EPIDEMIOLÓGICO',
            8: 'CERTIFICADO DE SAÚDE PARA DESLOCAÇÃO (CSD)'
        };
        
        doc.fillColor('#333')
            .fontSize(12)
            .text(tipos[dados.tipo] || 'CERTIFICADO MÉDICO', 70, y);
        
        y += 25;
        
        // Afficher les données médicales spécifiques
        for (let [key, value] of Object.entries(dados.dadosMedicos)) {
            if (value && value.trim) {
                // Formater le nom du champ
                const nomeCampo = key.replace(/([A-Z])/g, ' $1')
                    .replace(/^./, str => str.toUpperCase());
                
                doc.fontSize(11)
                    .fillColor('#000')
                    .text(`${nomeCampo}:`, 70, y);
                
                // Gérer les lignes longues
                const textWidth = 450;
                const textLines = doc.fontSize(11).text(value, 150, y, {
                    width: textWidth,
                    align: 'left'
                });
                
                y += 20 + (textLines.height || 0);
                
                // Nouvelle page si nécessaire
                if (y > 750) {
                    doc.addPage();
                    y = 50;
                }
            }
        }
        
        // Espace pour signature
        y += 30;
        
        // ===== ASSINATURAS =====
        doc.lineWidth(1)
            .moveTo(70, y)
            .lineTo(270, y)
            .stroke();
        
        doc.fontSize(10)
            .text('Assinatura do Laborantin/Técnico', 70, y + 5)
            .text(dados.laborantin.nome, 70, y + 20);
        
        doc.lineWidth(1)
            .moveTo(350, y)
            .lineTo(550, y)
            .stroke();
        
        doc.fontSize(10)
            .text('Assinatura do Diretor Clínico', 350, y + 5)
            .text(lab.diretor || 'Não informado', 350, y + 20);
        
        // Date
        y += 50;
        doc.fontSize(10)
            .text(`Data: ${new Date().toLocaleDateString('pt-PT')}`, 70, y);
        
        // ===== CODE QR (simulé avec texte) =====
        y += 30;
        
        // Créer un résumé des données pour le QR code
        const dadosQR = {
            certificado: numero,
            emissao: dados.dataEmissao,
            laboratorio: lab.nome,
            laborantin: dados.laborantin.nome,
            paciente: dados.paciente.nomeCompleto,
            bi: dados.paciente.bi,
            tipo: tipos[dados.tipo],
            dadosMedicos: dados.dadosMedicos
        };
        
        // Convertir en JSON et créer un hash
        const dadosJSON = JSON.stringify(dadosQR);
        const hashQR = crypto.createHash('sha256').update(dadosJSON).digest('hex').substring(0, 16);
        
        doc.fontSize(8)
            .fillColor('#666')
            .text('CÓDIGO DE VERIFICAÇÃO:', 50, y)
            .fontSize(10)
            .fillColor('#006633')
            .text(hashQR, 50, y + 10, { width: 500 })
            .fontSize(7)
            .fillColor('#999')
            .text('Este código único verifica a autenticidade do certificado', 50, y + 25);
        
        // ===== RODAPÉ =====
        doc.fontSize(8)
            .fillColor('#666')
            .text('Documento válido em todo território nacional', 50, 780, { align: 'center' });
        
        // Finaliser le PDF
        doc.end();
        
    } catch (error) {
        console.error('Erreur PDF:', error);
        res.status(500).json({ error: 'Erreur lors de la génération du PDF' });
    }
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

