// ============================================
// SNS - SISTEMA NACIONAL DE SAÚDE
// MINISTÉRIO DA SAÚDE - ANGOLA
// VERSÃO FINAL COM TODOS OS BOTÕES FUNCIONAIS
// ============================================

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

// ============================================
// CONFIGURAÇÕES
// ============================================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================
// CONEXÃO MONGODB
// ============================================
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sns';
mongoose.connect(MONGODB_URI)
.then(() => console.log('✅ MongoDB conectado'))
.catch(err => console.log('❌ MongoDB erro:', err));

// ============================================
// FUNÇÕES AUXILIARES
// ============================================
function gerarApiKey() {
    return 'SNS-' + Date.now() + '-' + crypto.randomBytes(8).toString('hex').toUpperCase();
}

function gerarChaveHospital() {
    return 'HOSP-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

function gerarChaveEmpresa() {
    return 'EMP-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

function validarNIF(nif) {
    return /^\d{10}$/.test(nif);
}

function gerarNumeroCertificado(tipo) {
    const ano = new Date().getFullYear();
    const mes = (new Date().getMonth() + 1).toString().padStart(2, '0');
    const random = crypto.randomBytes(4).toString('hex').toUpperCase();
    return 'CERT-' + tipo + '-' + ano + mes + '-' + random;
}

// ============================================
// MODELOS DE DADOS
// ============================================
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
    provincia: String,
    endereco: String,
    email: String,
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
    tipo: { type: Number, required: true, enum: [1, 2, 3, 4, 5] },
    paciente: {
        nomeCompleto: { type: String, required: true },
        genero: { type: String, enum: ['M', 'F'] },
        dataNascimento: Date,
        bi: String
    },
    dados: {
        genotipo: String,
        grupoSanguineo: String,
        avaliacao: String,
        periodoInicio: Date,
        periodoFim: Date,
        diasIncapacidade: Number,
        tipoAptidao: String,
        restricoes: [String]
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

// ============================================
// MIDDLEWARES
// ============================================
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
    if (!lab) return res.status(401).json({ erro: 'API Key inválida' });
    
    req.lab = lab;
    next();
};

// ============================================
// ROTAS PÚBLICAS
// ============================================
app.get('/', (req, res) => {
    res.send('<!DOCTYPE html>' +
    '<html>' +
    '<head><title>SNS - Angola</title>' +
    '<style>' +
    'body{background:#006633;font-family:Arial;display:flex;justify-content:center;align-items:center;height:100vh;}' +
    '.box{background:white;padding:30px;border-radius:10px;width:300px;text-align:center;}' +
    'a{display:block;margin:10px;padding:10px;background:#006633;color:white;text-decoration:none;border-radius:5px;}' +
    '</style>' +
    '</head>' +
    '<body>' +
    '<div class="box">' +
    '<h1>SNS - Angola</h1>' +
    '<a href="/ministerio">🏛️ Ministério da Saúde</a>' +
    '<a href="/lab-login">🔬 Laboratório</a>' +
    '</div>' +
    '</body></html>');
});

app.get('/ministerio', (req, res) => {
    res.send('<!DOCTYPE html>' +
    '<html>' +
    '<head><title>Login Ministério</title>' +
    '<style>' +
    'body{background:#006633;font-family:Arial;display:flex;justify-content:center;align-items:center;height:100vh;}' +
    '.box{background:white;padding:30px;border-radius:10px;width:300px;}' +
    'input{width:100%;padding:10px;margin:10px 0;}' +
    'button{width:100%;padding:10px;background:#006633;color:white;border:none;cursor:pointer;}' +
    '</style>' +
    '</head>' +
    '<body>' +
    '<div class="box">' +
    '<h2>Login Ministério</h2>' +
    '<input type="email" id="email" value="admin@sns.gov.ao">' +
    '<input type="password" id="password" value="Admin@2025">' +
    '<button onclick="login()">Entrar</button>' +
    '</div>' +
    '<script>' +
    'async function login(){' +
    'const r=await fetch("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:document.getElementById("email").value,password:document.getElementById("password").value})});' +
    'const d=await r.json();' +
    'if(d.token){localStorage.setItem("token",d.token);window.location.href="/admin-dashboard";}' +
    'else alert("Erro");}' +
    '</script>' +
    '</body></html>');
});

app.get('/lab-login', (req, res) => {
    res.send('<!DOCTYPE html>' +
    '<html>' +
    '<head><title>Login Laboratório</title>' +
    '<style>' +
    'body{background:#006633;font-family:Arial;display:flex;justify-content:center;align-items:center;height:100vh;}' +
    '.box{background:white;padding:30px;border-radius:10px;width:300px;}' +
    'input{width:100%;padding:10px;margin:10px 0;}' +
    'button{width:100%;padding:10px;background:#006633;color:white;border:none;cursor:pointer;}' +
    '</style>' +
    '</head>' +
    '<body>' +
    '<div class="box">' +
    '<h2>Login Laboratório</h2>' +
    '<input type="text" id="apiKey" placeholder="Digite sua API Key">' +
    '<button onclick="login()">Entrar</button>' +
    '</div>' +
    '<script>' +
    'function login(){' +
    'const key=document.getElementById("apiKey").value;' +
    'if(key){localStorage.setItem("labKey",key);window.location.href="/lab-dashboard";}' +
    'else alert("Digite a API Key");}' +
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
        res.json({ token, user: { nome: user.nome, email, role: user.role } });
    } else res.status(401).json({ erro: 'Email ou senha incorretos' });
});

// ============================================
// DASHBOARD DO MINISTÉRIO
// ============================================
app.get('/admin-dashboard', (req, res) => {
    res.send('<!DOCTYPE html>' +
    '<html>' +
    '<head><title>Ministério - SNS</title>' +
    '<style>' +
    'body{font-family:Arial;margin:0;display:flex;}' +
    '.sidebar{width:250px;background:#006633;color:white;height:100vh;padding:20px;position:fixed;}' +
    '.sidebar a{display:block;color:white;text-decoration:none;padding:10px;margin:5px 0;}' +
    '.sidebar a:hover{background:#004d26;}' +
    '.main{margin-left:290px;padding:30px;}' +
    '.btn{background:#006633;color:white;border:none;padding:10px 20px;cursor:pointer;margin:5px;}' +
    'table{width:100%;border-collapse:collapse;}' +
    'th{background:#006633;color:white;padding:10px;}' +
    'td{padding:10px;border-bottom:1px solid #ddd;}' +
    '.modal{display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);align-items:center;justify-content:center;}' +
    '.modal-content{background:white;padding:20px;border-radius:10px;width:400px;}' +
    '.modal-content input{width:100%;padding:8px;margin:5px 0;}' +
    '</style>' +
    '</head>' +
    '<body>' +
    '<div class="sidebar">' +
    '<h2>SNS - Ministério</h2>' +
    '<a href="#" onclick="mostrarSecao(\'dashboard\')">📊 Dashboard</a>' +
    '<a href="#" onclick="mostrarSecao(\'labs\')">🏥 Laboratórios</a>' +
    '<a href="#" onclick="mostrarSecao(\'hospitais\')">🏥 Hospitais</a>' +
    '<a href="#" onclick="mostrarSecao(\'empresas\')">🏢 Empresas</a>' +
    '<button onclick="logout()" style="margin-top:20px;background:#dc3545;color:white;border:none;padding:10px;width:100%;">Sair</button>' +
    '</div>' +
    '<div class="main">' +
    '<div id="secaoDashboard">' +
    '<h1>Dashboard</h1>' +
    '<div>Total Laboratórios: <span id="totalLabs">0</span></div>' +
    '<div>Total Hospitais: <span id="totalHospitais">0</span></div>' +
    '<div>Total Empresas: <span id="totalEmpresas">0</span></div>' +
    '</div>' +
    '<div id="secaoLabs" style="display:none;">' +
    '<h1>Laboratórios</h1>' +
    '<button class="btn" onclick="mostrarModalLab()">+ Novo Laboratório</button>' +
    '<table id="labsTable"><thead><tr><th>Nome</th><th>NIF</th><th>Província</th><th>Status</th><th>Ações</th></tr></thead><tbody></tbody></table>' +
    '</div>' +
    '<div id="secaoHospitais" style="display:none;">' +
    '<h1>Hospitais</h1>' +
    '<button class="btn" onclick="mostrarModalHospital()">+ Novo Hospital</button>' +
    '<table id="hospitaisTable"><thead><tr><th>Nome</th><th>NIF</th><th>Província</th><th>Diretor</th><th>Status</th><th>Ações</th></tr></thead><tbody></tbody></table>' +
    '</div>' +
    '<div id="secaoEmpresas" style="display:none;">' +
    '<h1>Empresas</h1>' +
    '<button class="btn" onclick="mostrarModalEmpresa()">+ Nova Empresa</button>' +
    '<table id="empresasTable"><thead><tr><th>Nome</th><th>NIF</th><th>Responsável</th><th>Status</th><th>Ações</th></tr></thead><tbody></tbody></table>' +
    '</div>' +
    '</div>' +

    '<!-- Modal Laboratório -->' +
    '<div id="modalLab" class="modal">' +
    '<div class="modal-content">' +
    '<h3>Novo Laboratório</h3>' +
    '<input type="text" id="labNome" placeholder="Nome">' +
    '<input type="text" id="labNIF" placeholder="NIF (10 dígitos)" maxlength="10">' +
    '<input type="text" id="labProvincia" placeholder="Província">' +
    '<input type="email" id="labEmail" placeholder="Email">' +
    '<input type="text" id="labDiretor" placeholder="Diretor">' +
    '<p id="labError" style="color:red;display:none;">NIF inválido</p>' +
    '<button onclick="criarLaboratorio()" style="background:#006633;color:white;padding:10px;width:100%;">Criar</button>' +
    '<button onclick="fecharModal(\'modalLab\')" style="margin-top:5px;">Cancelar</button>' +
    '</div></div>' +

    '<!-- Modal Hospital -->' +
    '<div id="modalHospital" class="modal">' +
    '<div class="modal-content">' +
    '<h3>Novo Hospital</h3>' +
    '<input type="text" id="hospitalNome" placeholder="Nome">' +
    '<input type="text" id="hospitalNIF" placeholder="NIF (10 dígitos)" maxlength="10">' +
    '<input type="text" id="hospitalProvincia" placeholder="Província">' +
    '<input type="text" id="hospitalDiretor" placeholder="Diretor">' +
    '<input type="email" id="hospitalEmail" placeholder="Email">' +
    '<p id="hospitalError" style="color:red;display:none;">NIF inválido</p>' +
    '<button onclick="criarHospital()" style="background:#006633;color:white;padding:10px;width:100%;">Criar</button>' +
    '<button onclick="fecharModal(\'modalHospital\')">Cancelar</button>' +
    '</div></div>' +

    '<!-- Modal Empresa -->' +
    '<div id="modalEmpresa" class="modal">' +
    '<div class="modal-content">' +
    '<h3>Nova Empresa</h3>' +
    '<input type="text" id="empresaNome" placeholder="Nome da empresa">' +
    '<input type="text" id="empresaNIF" placeholder="NIF (10 dígitos)" maxlength="10">' +
    '<input type="text" id="empresaResp" placeholder="Responsável">' +
    '<input type="email" id="empresaEmail" placeholder="Email">' +
    '<p id="empresaError" style="color:red;display:none;">NIF inválido</p>' +
    '<button onclick="criarEmpresa()" style="background:#006633;color:white;padding:10px;width:100%;">Criar</button>' +
    '<button onclick="fecharModal(\'modalEmpresa\')">Cancelar</button>' +
    '</div></div>' +

    '<script>' +
    'const token=localStorage.getItem("token");' +
    'if(!token) window.location.href="/ministerio";' +

    'function mostrarSecao(s){' +
    'document.getElementById("secaoDashboard").style.display="none";' +
    'document.getElementById("secaoLabs").style.display="none";' +
    'document.getElementById("secaoHospitais").style.display="none";' +
    'document.getElementById("secaoEmpresas").style.display="none";' +
    'if(s==="dashboard"){document.getElementById("secaoDashboard").style.display="block";carregarStats();}' +
    'if(s==="labs"){document.getElementById("secaoLabs").style.display="block";carregarLabs();}' +
    'if(s==="hospitais"){document.getElementById("secaoHospitais").style.display="block";carregarHospitais();}' +
    'if(s==="empresas"){document.getElementById("secaoEmpresas").style.display="block";carregarEmpresas();}}' +

    'function mostrarModalLab(){document.getElementById("modalLab").style.display="flex";}' +
    'function mostrarModalHospital(){document.getElementById("modalHospital").style.display="flex";}' +
    'function mostrarModalEmpresa(){document.getElementById("modalEmpresa").style.display="flex";}' +
    'function fecharModal(id){document.getElementById(id).style.display="none";}' +

    'async function carregarStats(){' +
    'const r=await fetch("/api/stats",{headers:{"Authorization":"Bearer "+token}});' +
    'const d=await r.json();' +
    'document.getElementById("totalLabs").innerText=d.labs||0;' +
    'document.getElementById("totalHospitais").innerText=d.hospitais||0;' +
    'document.getElementById("totalEmpresas").innerText=d.empresas||0;}' +

    'async function carregarLabs(){' +
    'const r=await fetch("/api/labs",{headers:{"Authorization":"Bearer "+token}});' +
    'const labs=await r.json();' +
    'let html="";' +
    'labs.forEach(l=>{html+="<tr><td>"+l.nome+"</td><td>"+l.nif+"</td><td>"+l.provincia+"</td><td>"+(l.ativo?"✅ Ativo":"❌ Inativo")+' +
    '"</td><td><button onclick=\'desativarLab(\\""+l._id+"\\")\'>Desativar</button></td></tr>";});' +
    'document.querySelector("#labsTable tbody").innerHTML=html;}' +

    'async function carregarHospitais(){' +
    'const r=await fetch("/api/hospitais",{headers:{"Authorization":"Bearer "+token}});' +
    'const hosp=await r.json();' +
    'let html="";' +
    'hosp.forEach(h=>{html+="<tr><td>"+h.nome+"</td><td>"+h.nif+"</td><td>"+h.provincia+"</td><td>"+h.diretor+"</td><td>"+(h.ativo?"✅ Ativo":"❌ Inativo")+' +
    '"</td><td><button onclick=\'desativarHospital(\\""+h._id+"\\")\'>Desativar</button></td></tr>";});' +
    'document.querySelector("#hospitaisTable tbody").innerHTML=html;}' +

    'async function carregarEmpresas(){' +
    'const r=await fetch("/api/empresas",{headers:{"Authorization":"Bearer "+token}});' +
    'const emp=await r.json();' +
    'let html="";' +
    'emp.forEach(e=>{html+="<tr><td>"+e.nome+"</td><td>"+e.nif+"</td><td>"+e.responsavel.nome+"</td><td>"+(e.ativo?"✅ Ativo":"❌ Inativo")+' +
    '"</td><td><button onclick=\'desativarEmpresa(\\""+e._id+"\\")\'>Desativar</button></td></tr>";});' +
    'document.querySelector("#empresasTable tbody").innerHTML=html;}' +

    'async function criarLaboratorio(){' +
    'const nif=document.getElementById("labNIF").value;' +
    'if(!/^\\d{10}$/.test(nif)){document.getElementById("labError").style.display="block";return;}' +
    'const dados={nome:document.getElementById("labNome").value,nif,provincia:document.getElementById("labProvincia").value,email:document.getElementById("labEmail").value,diretor:document.getElementById("labDiretor").value,tipo:"laboratorio"};' +
    'const r=await fetch("/api/labs",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},body:JSON.stringify(dados)});' +
    'const d=await r.json();' +
    'if(d.success){alert("✅ Laboratório criado!\\n\\n🔑 API Key: "+d.apiKey);fecharModal("modalLab");carregarLabs();}' +
    'else alert("Erro: "+d.erro);}' +

    'async function criarHospital(){' +
    'const nif=document.getElementById("hospitalNIF").value;' +
    'if(!/^\\d{10}$/.test(nif)){document.getElementById("hospitalError").style.display="block";return;}' +
    'const dados={nome:document.getElementById("hospitalNome").value,nif,provincia:document.getElementById("hospitalProvincia").value,diretor:document.getElementById("hospitalDiretor").value,email:document.getElementById("hospitalEmail").value};' +
    'const r=await fetch("/api/hospitais",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},body:JSON.stringify(dados)});' +
    'const d=await r.json();' +
    'if(d.success){alert("✅ Hospital criado!\\n\\n🔑 Chave: "+d.chave);fecharModal("modalHospital");carregarHospitais();}' +
    'else alert("Erro: "+d.erro);}' +

    'async function criarEmpresa(){' +
    'const nif=document.getElementById("empresaNIF").value;' +
    'if(!/^\\d{10}$/.test(nif)){document.getElementById("empresaError").style.display="block";return;}' +
    'const dados={nome:document.getElementById("empresaNome").value,nif,responsavel:{nome:document.getElementById("empresaResp").value},email:document.getElementById("empresaEmail").value};' +
    'const r=await fetch("/api/empresas",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},body:JSON.stringify(dados)});' +
    'const d=await r.json();' +
    'if(d.success){alert("✅ Empresa criada!\\n\\n🔑 Chave: "+d.chave);fecharModal("modalEmpresa");carregarEmpresas();}' +
    'else alert("Erro: "+d.erro);}' +

    'async function desativarLab(id){' +
    'if(!confirm("Tem certeza?"))return;' +
    'await fetch("/api/labs/"+id,{method:"DELETE",headers:{"Authorization":"Bearer "+token}});' +
    'carregarLabs();}' +

    'async function desativarHospital(id){' +
    'if(!confirm("Tem certeza?"))return;' +
    'await fetch("/api/hospitais/"+id,{method:"DELETE",headers:{"Authorization":"Bearer "+token}});' +
    'carregarHospitais();}' +

    'async function desativarEmpresa(id){' +
    'if(!confirm("Tem certeza?"))return;' +
    'await fetch("/api/empresas/"+id,{method:"DELETE",headers:{"Authorization":"Bearer "+token}});' +
    'carregarEmpresas();}' +

    'function logout(){localStorage.removeItem("token");window.location.href="/";}' +
    'mostrarSecao("dashboard");' +
    '</script>' +
    '</body></html>');
});

// ============================================
// DASHBOARD DO LABORATÓRIO
// ============================================
app.get('/lab-dashboard', (req, res) => {
    res.send('<!DOCTYPE html>' +
    '<html>' +
    '<head><title>Laboratório - SNS</title>' +
    '<style>' +
    'body{font-family:Arial;margin:0;display:flex;}' +
    '.sidebar{width:250px;background:#006633;color:white;height:100vh;padding:20px;position:fixed;}' +
    '.sidebar a{display:block;color:white;text-decoration:none;padding:10px;margin:5px 0;}' +
    '.sidebar a:hover{background:#004d26;}' +
    '.main{margin-left:290px;padding:30px;}' +
    '.btn{background:#006633;color:white;border:none;padding:10px 20px;cursor:pointer;margin:5px;}' +
    '.welcome{background:#e8f5e9;padding:20px;border-left:5px solid #006633;margin-bottom:20px;}' +
    'table{width:100%;border-collapse:collapse;}' +
    'th{background:#006633;color:white;padding:10px;}' +
    'td{padding:10px;border-bottom:1px solid #ddd;}' +
    '</style>' +
    '</head>' +
    '<body>' +
    '<div class="sidebar">' +
    '<h2>SNS - Laboratório</h2>' +
    '<a href="#" onclick="mostrarSecao(\'dashboard\')">📊 Dashboard</a>' +
    '<a href="#" onclick="mostrarSecao(\'certificados\')">📋 Certificados</a>' +
    '<button onclick="logout()" style="margin-top:20px;background:#dc3545;color:white;border:none;padding:10px;width:100%;">Sair</button>' +
    '</div>' +
    '<div class="main">' +
    '<div id="secaoDashboard">' +
    '<div id="welcomeBanner" class="welcome"></div>' +
    '<h1>Dashboard</h1>' +
    '<div>Total de certificados emitidos: <span id="totalCerts">0</span></div>' +
    '</div>' +
    '<div id="secaoCertificados" style="display:none;">' +
    '<h1>Certificados</h1>' +
    '<button class="btn" onclick="mostrarModalCertificado()">+ Novo Certificado</button>' +
    '<table id="certTable"><thead><tr><th>Número</th><th>Tipo</th><th>Paciente</th><th>Data</th></tr></thead><tbody></tbody></table>' +
    '</div>' +
    '</div>' +

    '<div id="modalCertificado" class="modal" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);align-items:center;justify-content:center;">' +
    '<div class="modal-content" style="background:white;padding:20px;border-radius:10px;width:400px;">' +
    '<h3>Novo Certificado</h3>' +
    '<input type="text" id="certNome" placeholder="Nome completo">' +
    '<select id="certTipo">' +
    '<option value="1">🧬 Genótipo</option>' +
    '<option value="2">🩺 Boa Saúde</option>' +
    '<option value="3">📋 Incapacidade</option>' +
    '<option value="4">💪 Aptidão</option>' +
    '</select>' +
    '<input type="text" id="certBI" placeholder="BI">' +
    '<button onclick="emitirCertificado()" style="background:#006633;color:white;padding:10px;width:100%;">Emitir</button>' +
    '<button onclick="fecharModal()" style="margin-top:5px;">Cancelar</button>' +
    '</div></div>' +

    '<script>' +
    'const labKey=localStorage.getItem("labKey");' +
    'if(!labKey) window.location.href="/lab-login";' +

    'async function carregarLaboratorio(){' +
    'const r=await fetch("/api/labs/me",{headers:{"x-api-key":labKey}});' +
    'const lab=await r.json();' +
    'if(lab){' +
    'document.getElementById("welcomeBanner").innerHTML="👋 Olá, "+lab.nome+"! 💪 Pronto para mais um dia de trabalho? Vamos juntos!";' +
    '}}' +

    'function mostrarSecao(s){' +
    'document.getElementById("secaoDashboard").style.display="none";' +
    'document.getElementById("secaoCertificados").style.display="none";' +
    'if(s==="dashboard"){document.getElementById("secaoDashboard").style.display="block";carregarStats();}' +
    'if(s==="certificados"){document.getElementById("secaoCertificados").style.display="block";carregarCertificados();}}' +

    'function mostrarModalCertificado(){document.getElementById("modalCertificado").style.display="flex";}' +
    'function fecharModal(){document.getElementById("modalCertificado").style.display="none";}' +

    'async function carregarStats(){' +
    'const r=await fetch("/api/certificados/lab",{headers:{"x-api-key":labKey}});' +
    'const certs=await r.json();' +
    'document.getElementById("totalCerts").innerText=certs.length;}' +

    'async function carregarCertificados(){' +
    'const r=await fetch("/api/certificados/lab",{headers:{"x-api-key":labKey}});' +
    'const certs=await r.json();' +
    'let html="";' +
    'certs.forEach(c=>{html+="<tr><td>"+c.numero+"</td><td>"+c.tipo+"</td><td>"+c.paciente.nomeCompleto+"</td><td>"+new Date(c.emitidoEm).toLocaleDateString()+"</td></tr>";});' +
    'document.querySelector("#certTable tbody").innerHTML=html;}' +

    'async function emitirCertificado(){' +
    'const dados={paciente:{nomeCompleto:document.getElementById("certNome").value,bi:document.getElementById("certBI").value},dados:{}};' +
    'const tipo=document.getElementById("certTipo").value;' +
    'const r=await fetch("/api/certificados/emitir/"+tipo,{method:"POST",headers:{"Content-Type":"application/json","x-api-key":labKey},body:JSON.stringify(dados)});' +
    'const d=await r.json();' +
    'if(d.success){alert("✅ Certificado emitido! Nº: "+d.numero);fecharModal();carregarCertificados();}' +
    'else alert("Erro: "+d.erro);}' +

    'carregarLaboratorio();' +
    'mostrarSecao("dashboard");' +
    'function logout(){localStorage.removeItem("labKey");window.location.href="/";}' +
    '</script>' +
    '</body></html>');
});

// ============================================
// API DE LABORATÓRIOS
// ============================================
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
        
        res.json({ success: true, apiKey });
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

// ============================================
// API DE HOSPITAIS
// ============================================
app.post('/api/hospitais', authMiddleware, async (req, res) => {
    try {
        const dados = req.body;
        if (!dados.nif || !validarNIF(dados.nif)) {
            return res.status(400).json({ erro: 'NIF inválido' });
        }
        
        const chave = gerarChaveHospital();
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

app.delete('/api/hospitais/:id', authMiddleware, async (req, res) => {
    try {
        await Hospital.findByIdAndUpdate(req.params.id, { ativo: false });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ erro: 'Erro interno' });
    }
});

// ============================================
// API DE EMPRESAS
// ============================================
app.post('/api/empresas', authMiddleware, async (req, res) => {
    try {
        const dados = req.body;
        if (!dados.nif || !validarNIF(dados.nif)) {
            return res.status(400).json({ erro: 'NIF inválido' });
        }
        
        const chave = gerarChaveEmpresa();
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

app.delete('/api/empresas/:id', authMiddleware, async (req, res) => {
    try {
        await Empresa.findByIdAndUpdate(req.params.id, { ativo: false });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ erro: 'Erro interno' });
    }
});

// ============================================
// API DE CERTIFICADOS
// ============================================
app.post('/api/certificados/emitir/:tipo', labMiddleware, async (req, res) => {
    try {
        const tipo = parseInt(req.params.tipo);
        const dados = req.body;
        
        const numero = gerarNumeroCertificado(tipo);
        const hash = crypto.createHash('sha256').update(numero + JSON.stringify(dados)).digest('hex');
        
        const certificado = new Certificate({
            numero,
            tipo,
            paciente: dados.paciente,
            dados: dados.dados,
            hash,
            emitidoPor: req.lab._id
        });
        
        await certificado.save();
        
        req.lab.totalEmissoes++;
        await req.lab.save();
        
        res.json({ success: true, numero, hash });
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao emitir certificado' });
    }
});

app.get('/api/certificados/lab', labMiddleware, async (req, res) => {
    try {
        const certs = await Certificate.find({ emitidoPor: req.lab._id })
            .sort({ emitidoEm: -1 })
            .limit(50);
        res.json(certs);
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao buscar certificados' });
    }
});

// ============================================
// ESTATÍSTICAS
// ============================================
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

// ============================================
// INICIAR SERVIDOR
// ============================================
app.listen(PORT, () => {
    console.log('\n' + '='.repeat(50));
    console.log('🚀 SNS - Servidor iniciado');
    console.log('='.repeat(50));
    console.log('📱 URL: http://localhost:' + PORT);
    console.log('🏛️ Ministério: /ministerio (admin@sns.gov.ao)');
    console.log('🔬 Laboratório: /lab-login (com API Key)');
    console.log('✅ Todos os botões funcionais');
    console.log('='.repeat(50) + '\n');
});
