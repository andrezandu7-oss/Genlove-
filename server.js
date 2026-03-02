// ============================================
// SNS - SISTEMA NACIONAL DE SAÚDE
// MINISTÉRIO DA SAÚDE - ANGOLA
// VERSÃO FINAL COM TODOS OS AMENDAMENTOS
// ============================================

const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const crypto = require('crypto');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
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

function gerarNumeroCertificado(tipo) {
    const ano = new Date().getFullYear();
    const mes = (new Date().getMonth() + 1).toString().padStart(2, '0');
    const random = crypto.randomBytes(4).toString('hex').toUpperCase();
    return 'CERT-' + tipo + '-' + ano + mes + '-' + random;
}

function gerarNumeroCPN() {
    const ano = new Date().getFullYear();
    const mes = (new Date().getMonth() + 1).toString().padStart(2, '0');
    const random = crypto.randomBytes(4).toString('hex').toUpperCase();
    return 'CPN-' + ano + mes + '-' + random;
}

function gerarNumeroEpidemico() {
    const ano = new Date().getFullYear();
    const mes = (new Date().getMonth() + 1).toString().padStart(2, '0');
    const random = crypto.randomBytes(4).toString('hex').toUpperCase();
    return 'EPI-' + ano + mes + '-' + random;
}

function gerarDadosGenlove(paciente, dados) {
    const partes = paciente.nomeCompleto.split(' ');
    const prenom = partes[0] || '';
    const nom = partes.slice(1).join(' ') || '';
    const genre = paciente.genero || '';
    const genotype = dados.genotipo || '';
    const groupe = dados.grupoSanguineo || '';
    return prenom + '|' + nom + '|' + genre + '|' + genotype + '|' + groupe;
}

function validarNIF(nif) {
    return /^\d{10}$/.test(nif);
}

function gerarChaveHospital(nomeHospital) {
    const prefixo = 'HOSP';
    const codigo = nomeHospital.substring(0,4).toUpperCase().replace(/[^A-Z]/g, '');
    return prefixo + '-' + codigo + '-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

function gerarChaveEmpresa(nomeEmpresa, nif) {
    const prefixo = 'EMP';
    const codigo = nomeEmpresa.substring(0,4).toUpperCase().replace(/[^A-Z]/g, '');
    const nifShort = nif.substring(0,4);
    return prefixo + '-' + codigo + '-' + nifShort + '-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

// ============================================
// CHAVES DE APPS PARCEIROS (FIXAS NO CÓDIGO)
// ============================================
const GENLOVE_KEYS = [
    'GENLOVE-SNS-KEY-2025-SECRET',      // Produção
    'GENLOVE-DEV-KEY-2025-TESTE'        // Desenvolvimento
];

const SAUDE24_KEYS = [
    'SAUDE24-API-KEY-2025'
];

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
    tipo: { 
        type: String, 
        enum: ['laboratorio', 'hospital', 'clinica'],
        required: true 
    },
    provincia: { type: String, required: true },
    municipio: String,
    email: String,
    telefone: String,
    diretor: String,
    apiKey: { type: String, unique: true },
    ativo: { type: Boolean, default: true },
    totalEmissoes: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    ultimoAcesso: Date,
    
    dispositivos: [{
        ip: String,
        userAgent: String,
        primeiroAcesso: Date,
        ultimoAcesso: Date,
        totalEmissoesNesteDispositivo: { type: Number, default: 0 }
    }],
    
    alertas: [{
        tipo: { 
            type: String, 
            enum: ['MULTIPLOS_IPS', 'HORARIO_ATIPICO', 'VOLUME_ANORMAL', 'NIF_DUPLICADO']
        },
        data: { type: Date, default: Date.now },
        descricao: String,
        resolvido: { type: Boolean, default: false }
    }]
});

const hospitalSchema = new mongoose.Schema({
    nome: { type: String, required: true },
    nif: { type: String, unique: true, required: true },
    provincia: { type: String, required: true },
    municipio: String,
    endereco: String,
    diretor: String,
    email: String,
    telefone: String,
    chaveAcesso: { type: String, unique: true },
    ativo: { type: Boolean, default: true },
    totalConsultas: { type: Number, default: 0 },
    criadoEm: { type: Date, default: Date.now }
});

const empresaSchema = new mongoose.Schema({
    nome: { type: String, required: true },
    nif: { type: String, unique: true, required: true },
    endereco: String,
    email: String,
    telefone: String,
    responsavel: {
        nome: { type: String, required: true },
        cargo: String,
        email: String,
        telefone: String
    },
    chaveAcesso: { type: String, unique: true },
    ativo: { type: Boolean, default: true },
    totalConsultas: { type: Number, default: 0 },
    criadoEm: { type: Date, default: Date.now },
    criadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

const certificateSchema = new mongoose.Schema({
    numero: { type: String, unique: true },
    tipo: { type: Number, required: true, enum: [1, 2, 3, 4, 5] },
    paciente: {
        nomeCompleto: { type: String, required: true },
        prenome: String,
        sobrenome: String,
        genero: { type: String, enum: ['M', 'F'] },
        dataNascimento: Date,
        bi: String,
        telefone: String,
        provincia: String
    },
    dados: {
        genotipo: String,
        grupoSanguineo: String,
        avaliacao: String,
        finalidade: [String],
        periodoInicio: Date,
        periodoFim: Date,
        diasIncapacidade: Number,
        tipoAptidao: String,
        restricoes: [String],
        obstetricos: {
            gestacoes: Number,
            partos: Number
        },
        dpp: Date,
        ig: Number
    },
    dadosGenlove: String,
    hash: { type: String, unique: true },
    emitidoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Lab' },
    emitidoEm: { type: Date, default: Date.now },
    validoAte: Date,
    ativo: { type: Boolean, default: true }
});

const cpnSchema = new mongoose.Schema({
    numero: { type: String, unique: true },
    paciente: {
        nomeCompleto: { type: String, required: true },
        dataNascimento: { type: Date, required: true },
        bi: { type: String, required: true },
        telefone: String,
        provincia: String,
        municipio: String
    },
    obstetricos: {
        gestacoes: { type: Number, default: 0 },
        partos: { type: Number, default: 0 },
        cesarianas: { type: Number, default: 0 },
        abortos: { type: Number, default: 0 },
        dpp: Date,
        ig: Number,
        risco: { type: Boolean, default: false }
    },
    exames: {
        genotipo: { 
            realizado: Boolean, 
            resultado: { type: String, enum: ['AA', 'AS', 'SS'] },
            naoSolicitado: { type: Boolean, default: false }
        },
        grupoSanguineo: { 
            realizado: Boolean, 
            resultado: { type: String, enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] },
            naoSolicitado: { type: Boolean, default: false }
        },
        vih: { 
            realizado: Boolean, 
            resultado: { type: String, enum: ['Negativo', 'Positivo'] },
            naoSolicitado: { type: Boolean, default: false }
        },
        malaria: { 
            realizado: Boolean, 
            resultado: { type: String, enum: ['Negativo', 'Positivo', '3000 P/L'] },
            naoSolicitado: { type: Boolean, default: false }
        },
        sifilis: { 
            realizado: Boolean, 
            resultado: { type: String, enum: ['Negativo', 'Positivo'] },
            naoSolicitado: { type: Boolean, default: false }
        },
        hemoglobina: { 
            realizado: Boolean, 
            valor: Number,
            naoSolicitado: { type: Boolean, default: false }
        },
        hepatiteB: { 
            realizado: Boolean, 
            resultado: { type: String, enum: ['Negativo', 'Positivo'] },
            naoSolicitado: { type: Boolean, default: false }
        },
        toxoplasmose: { 
            realizado: Boolean, 
            resultado: { type: String, enum: ['Negativo', 'Positivo'] },
            naoSolicitado: { type: Boolean, default: false }
        },
        glicemia: { 
            realizado: Boolean, 
            valor: Number,
            naoSolicitado: { type: Boolean, default: false }
        }
    },
    prevencao: {
        vacinaTetano: { doses: Number, completo: Boolean },
        fansidar: { doses: Number, completo: Boolean },
        ferro: Boolean,
        mosquiteiro: Boolean
    },
    medicoResponsavel: String,
    unidadeSanitaria: String,
    emitidoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Lab' },
    emitidoEm: { type: Date, default: Date.now },
    hash: { type: String, unique: true }
});

const epidemicoSchema = new mongoose.Schema({
    numero: { type: String, unique: true },
    doenca: { 
        type: String, 
        enum: ['Febre Amarela', 'Ebola', 'COVID-19', 'Cólera', 'Outra'],
        required: true 
    },
    outraDoenca: String,
    paciente: {
        nomeCompleto: { type: String, required: true },
        dataNascimento: { type: Date, required: true },
        bi: { type: String, required: true },
        passaporte: String,
        telefone: String
    },
    exame: {
        dataExame: { type: Date, required: true },
        metodo: { 
            type: String, 
            enum: ['PCR', 'Teste Rápido', 'Sorologia', 'Cultura'],
            required: true 
        },
        resultado: { 
            type: String, 
            enum: ['Positivo', 'Negativo', 'Inconclusivo', 'Detetável', 'Não detetável'],
            required: true 
        },
        laboratorio: String,
        tecnico: String
    },
    contexto: {
        viagemInternacional: Boolean,
        destino: String
    },
    hash: { type: String, unique: true },
    emitidoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Lab' },
    emitidoEm: { type: Date, default: Date.now },
    validoAte: Date
});

const acessoLogSchema = new mongoose.Schema({
    tipoAcesso: { 
        type: String, 
        enum: ['ministerio', 'laboratorio', 'hospital', 'empresa', 'genlove']
    },
    entidadeId: { type: mongoose.Schema.Types.ObjectId },
    entidadeNome: String,
    certificadoId: String,
    tipoCertificado: Number,
    dataAcesso: { type: Date, default: Date.now },
    ip: String
});

const User = mongoose.model('User', userSchema);
const Lab = mongoose.model('Lab', labSchema);
const Hospital = mongoose.model('Hospital', hospitalSchema);
const Empresa = mongoose.model('Empresa', empresaSchema);
const Certificate = mongoose.model('Certificate', certificateSchema);
const CPN = mongoose.model('CPN', cpnSchema);
const Epidemico = mongoose.model('Epidemico', epidemicoSchema);
const AcessoLog = mongoose.model('AcessoLog', acessoLogSchema);

// ============================================
// MIDDLEWARES
// ============================================
const identificarAcesso = async (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    const tipoAcesso = req.headers['x-tipo-acesso'];
    
    if (!apiKey || !tipoAcesso) {
        return res.status(401).json({ erro: 'Credenciais não fornecidas' });
    }
    
    try {
        switch(tipoAcesso) {
            case 'genlove':
                if (!GENLOVE_KEYS.includes(apiKey)) {
                    return res.status(403).json({ erro: 'Chave Genlove inválida' });
                }
                req.accessType = 'genlove';
                req.accessId = 'genlove-app';
                req.accessName = 'Genlove';
                break;
                
            case 'laboratorio':
                const lab = await Lab.findOne({ apiKey, ativo: true });
                if (!lab) {
                    return res.status(403).json({ erro: 'Chave de laboratório inválida' });
                }
                req.accessType = 'laboratorio';
                req.accessId = lab._id;
                req.accessName = lab.nome;
                req.lab = lab;
                break;
                
            case 'hospital':
                const hospital = await Hospital.findOne({ chaveAcesso: apiKey, ativo: true });
                if (!hospital) {
                    return res.status(403).json({ erro: 'Chave de hospital inválida' });
                }
                req.accessType = 'hospital';
                req.accessId = hospital._id;
                req.accessName = hospital.nome;
                req.hospital = hospital;
                break;
                
            case 'empresa':
                const empresa = await Empresa.findOne({ chaveAcesso: apiKey, ativo: true });
                if (!empresa) {
                    return res.status(403).json({ erro: 'Chave de empresa inválida' });
                }
                req.accessType = 'empresa';
                req.accessId = empresa._id;
                req.accessName = empresa.nome;
                req.empresa = empresa;
                break;
                
            default:
                return res.status(400).json({ erro: 'Tipo de acesso inválido' });
        }
        
        next();
    } catch (error) {
        res.status(500).json({ erro: 'Erro interno' });
    }
};

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
    '<html lang="pt">' +
    '<head><meta charset="UTF-8"><title>SNS - Login</title>' +
    '<style>' +
    'body{background:linear-gradient(135deg,#006633,#003300);height:100vh;display:flex;align-items:center;justify-content:center;font-family:Arial;}' +
    '.login-box{background:white;padding:40px;border-radius:10px;width:350px;box-shadow:0 10px 30px rgba(0,0,0,0.3);}' +
    'h1{color:#006633;text-align:center;margin-bottom:30px;}' +
    'input{width:100%;padding:12px;margin:10px 0;border:1px solid #ddd;border-radius:5px;}' +
    'button{width:100%;padding:12px;background:#006633;color:white;border:none;border-radius:5px;cursor:pointer;}' +
    'button:hover{background:#004d26;}' +
    '.error{color:red;text-align:center;margin-top:10px;display:none;}' +
    '</style>' +
    '</head>' +
    '<body>' +
    '<div class="login-box">' +
    '<h1>SNS - Angola</h1>' +
    '<p style="text-align:center;margin-bottom:20px;">🏛️ Ministério da Saúde</p>' +
    '<div id="error" class="error"></div>' +
    '<input type="email" id="email" placeholder="Email" value="admin@sns.gov.ao">' +
    '<input type="password" id="password" placeholder="Senha" value="Admin@2025">' +
    '<button onclick="login()">Entrar como Ministério</button>' +
    '<p style="text-align:center;margin-top:20px;">' +
    '<a href="/lab-login" style="color:#006633;">🔬 Entrar como Laboratório</a>' +
    '</p>' +
    '</div>' +
    '<script>' +
    'async function login(){' +
    'const e=document.getElementById("email").value;' +
    'const s=document.getElementById("password").value;' +
    'const r=await fetch("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:e,password:s})});' +
    'const d=await r.json();' +
    'if(d.token){localStorage.setItem("token",d.token);window.location.href="/dashboard";}' +
    'else{document.getElementById("error").style.display="block";document.getElementById("error").innerText=d.erro||"Erro no login";}}' +
    '</script>' +
    '</body></html>');
});

app.get('/lab-login', (req, res) => {
    res.send('<!DOCTYPE html>' +
    '<html><head><meta charset="UTF-8"><title>Login Laboratório</title>' +
    '<style>' +
    'body{background:linear-gradient(135deg,#006633,#003300);display:flex;justify-content:center;align-items:center;height:100vh;font-family:Arial;}' +
    '.box{background:white;padding:40px;border-radius:10px;width:350px;}' +
    'h1{color:#006633;text-align:center;margin-bottom:30px;}' +
    'input{width:100%;padding:12px;margin:10px 0;border:1px solid #ddd;border-radius:5px;}' +
    'button{width:100%;padding:12px;background:#006633;color:white;border:none;border-radius:5px;cursor:pointer;}' +
    '.info{text-align:center;margin-top:20px;color:#666;font-size:12px;}' +
    '</style>' +
    '</head>' +
    '<body>' +
    '<div class="box">' +
    '<h1>SNS - Angola</h1>' +
    '<p style="text-align:center;margin-bottom:20px;">🔬 Acesso Laboratório</p>' +
    '<input type="text" id="apiKey" placeholder="Digite sua API Key">' +
    '<button onclick="loginLab()">Entrar</button>' +
    '<div class="info">' +
    '<p>⚠️ Use a API Key fornecida pelo ministério</p>' +
    '<p><a href="/" style="color:#006633;">← Voltar</a></p>' +
    '</div>' +
    '</div>' +
    '<script>' +
    'function loginLab(){' +
    'const key=document.getElementById("apiKey").value;' +
    'if(key){' +
    'localStorage.setItem("labKey",key);' +
    'window.location.href="/dashboard";' +
    '} else alert("Digite a API Key");}' +
    '</script>' +
    '</body></html>');
});

// ============================================
// DASHBOARD PRINCIPAL
// ============================================
app.get('/dashboard', (req, res) => {
    res.send('<!DOCTYPE html>' +
    '<html lang="pt">' +
    '<head><meta charset="UTF-8"><title>Dashboard - SNS</title>' +
    '<style>' +
    'body{font-family:Arial;margin:0;display:flex;}' +
    '.sidebar{width:250px;background:#006633;color:white;height:100vh;padding:20px;position:fixed;}' +
    '.sidebar h2{margin-bottom:30px;}' +
    '.sidebar a{display:block;color:white;text-decoration:none;padding:10px;margin:5px 0;border-radius:5px;}' +
    '.sidebar a:hover{background:#004d26;}' +
    '.main{margin-left:290px;padding:30px;flex:1;}' +
    'button{background:#dc3545;color:white;border:none;padding:10px 20px;cursor:pointer;border-radius:5px;}' +
    '.btn-criar{background:#006633;color:white;border:none;padding:10px 20px;border-radius:5px;cursor:pointer;margin-bottom:20px;}' +
    '.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:20px;}' +
    '.stat-card{background:#f5f5f5;padding:20px;border-radius:5px;text-align:center;}' +
    '.stat-card h3{color:#666;margin-bottom:10px;}' +
    '.stat-card .value{font-size:24px;font-weight:bold;color:#006633;}' +
    'table{width:100%;background:white;border-radius:5px;overflow:hidden;box-shadow:0 2px 5px rgba(0,0,0,0.1);}' +
    'th{background:#006633;color:white;padding:12px;text-align:left;}' +
    'td{padding:10px;border-bottom:1px solid #eee;}' +
    '.modal{display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);align-items:center;justify-content:center;}' +
    '.modal-content{background:white;padding:30px;border-radius:10px;width:500px;max-height:80vh;overflow-y:auto;}' +
    '.modal-content input,.modal-content select,.modal-content textarea{width:100%;padding:8px;margin:10px 0;border:1px solid #ddd;border-radius:5px;}' +
    '.tipo-badge{padding:3px 10px;border-radius:15px;font-size:12px;}' +
    '.tipo1{background:#e3f2fd;color:#0d47a1;}' +
    '.tipo2{background:#e8f5e8;color:#1b5e20;}' +
    '.tipo3{background:#fff3e0;color:#e65100;}' +
    '.tipo4{background:#f3e5f5;color:#4a148c;}' +
    '.tipo5{background:#fce4ec;color:#880e4f;}' +
    '.user-badge{padding:10px;border-radius:5px;margin-bottom:20px;font-weight:bold;}' +
    '.badge-ministerio{background:#e8f5e9;color:#006633;border:2px solid #006633;}' +
    '.badge-laboratorio{background:#fff3e0;color:#ff9800;border:2px solid #ff9800;}' +
    '.alerta-card{background:#fff3e0;border-left:5px solid #ff9800;padding:15px;margin-bottom:10px;border-radius:5px;}' +
    '</style>' +
    '</head>' +
    '<body>' +
    '<div class="sidebar">' +
    '<h2>SNS</h2>' +
    '<div id="userType" class="user-badge badge-ministerio">Carregando...</div>' +
    '<a href="#" onclick="mostrarSecao(\'dashboard\')">📊 Dashboard</a>' +
    '<a href="#" onclick="mostrarSecao(\'labs\')">🏥 Laboratórios</a>' +
    '<a href="#" onclick="mostrarSecao(\'hospitais\')">🏥 Hospitais</a>' +
    '<a href="#" onclick="mostrarSecao(\'empresas\')">🏢 Empresas</a>' +
    '<a href="#" onclick="mostrarSecao(\'certificados\')" id="menuCertificados" style="display:none;">📋 Certificados</a>' +
    '<a href="#" onclick="mostrarSecao(\'alertas\')" id="menuAlertas" style="display:none;">🚨 Alertas</a>' +
    '<button onclick="logout()" style="margin-top:20px;background:#dc3545;width:100%;">Sair</button>' +
    '</div>' +
    '<div class="main">' +

    '<div id="welcomeBanner" style="background:linear-gradient(135deg,#f5f5f5,#ffffff);border-radius:10px;padding:0;margin-bottom:25px;box-shadow:0 4px 15px rgba(0,102,51,0.1);border-left:5px solid #006633;overflow:hidden;display:none;">' +
    '<div style="display:flex;align-items:center;">' +
    '<div style="background:#006633;padding:25px;color:white;font-size:48px;">🔬</div>' +
    '<div style="flex:1;padding:20px;">' +
    '<h3 style="color:#006633;margin-bottom:5px;font-size:20px;" id="welcomeLabName"></h3>' +
    '<div style="display:flex;gap:20px;margin-top:10px;flex-wrap:wrap;">' +
    '<div><span style="color:#666;">📍</span> <span id="welcomeLabProvincia"></span></div>' +
    '<div><span style="color:#666;">🏷️</span> <span id="welcomeLabTipo"></span></div>' +
    '<div><span style="color:#666;">🆔</span> <span id="welcomeLabNIF"></span></div>' +
    '<div><span style="color:#666;">🔑</span> <span id="welcomeLabKey"></span></div>' +
    '</div>' +
    '<div style="margin-top:10px;padding-top:10px;border-top:1px dashed #ddd;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;">' +
    '<div><span style="color:#666;">⏱️</span> <span id="welcomeLabLastAccess"></span></div>' +
    '<div><span style="color:#666;">📊</span> <span id="welcomeLabStats"></span></div>' +
    '</div>' +
    '</div>' +
    '<button onclick="fecharWelcome()" style="background:none;border:none;font-size:24px;cursor:pointer;color:#999;margin-right:20px;padding:10px;" title="Fechar">✕</button>' +
    '</div>' +
    '</div>' +

    '<div id="secaoDashboard">' +
    '<h1>Dashboard</h1>' +
    '<div class="stats">' +
    '<div class="stat-card"><h3>Laboratórios</h3><div class="value" id="totalLabs">0</div></div>' +
    '<div class="stat-card"><h3>Hospitais</h3><div class="value" id="totalHospitais">0</div></div>' +
    '<div class="stat-card"><h3>Empresas</h3><div class="value" id="totalEmpresas">0</div></div>' +
    '</div>' +
    '<div class="stats">' +
    '<div class="stat-card"><h3>Certificados</h3><div class="value" id="totalCerts">0</div></div>' +
    '<div class="stat-card"><h3>Pré-Natal</h3><div class="value" id="totalCPN">0</div></div>' +
    '<div class="stat-card"><h3>Epidemiológicos</h3><div class="value" id="totalEpi">0</div></div>' +
    '</div>' +
    '</div>' +

    '<div id="secaoLabs" style="display:none;">' +
    '<h1>Laboratórios</h1>' +
    '<button class="btn-criar" id="criarLabBtn" onclick="mostrarModalLab()" style="display:none;">+ Novo Laboratório</button>' +
    '<table><thead><tr><th>ID</th><th>Nome</th><th>NIF</th><th>Tipo</th><th>Província</th><th>Status</th><th>Ações</th></tr></thead>' +
    '<tbody id="labsBody"></tbody></table>' +
    '</div>' +

    '<div id="secaoHospitais" style="display:none;">' +
    '<h1>Hospitais</h1>' +
    '<button class="btn-criar" onclick="mostrarModalHospital()">+ Novo Hospital</button>' +
    '<table><thead><tr><th>Nome</th><th>NIF</th><th>Província</th><th>Diretor</th><th>Status</th><th>Ações</th></tr></thead>' +
    '<tbody id="hospitaisBody"></tbody></table>' +
    '</div>' +

    '<div id="secaoEmpresas" style="display:none;">' +
    '<h1>Empresas</h1>' +
    '<button class="btn-criar" onclick="mostrarModalEmpresa()">+ Nova Empresa</button>' +
    '<table><thead><tr><th>Nome</th><th>NIF</th><th>Responsável</th><th>Status</th><th>Ações</th></tr></thead>' +
    '<tbody id="empresasBody"></tbody></table>' +
    '</div>' +

    '<div id="secaoCertificados" style="display:none;">' +
    '<h1>Certificados</h1>' +
    '<div style="margin-bottom:20px;">' +
    '<button class="tab-btn" onclick="mostrarAbaCert(\'geral\')">📋 Gerais</button>' +
    '<button class="tab-btn" onclick="mostrarAbaCert(\'cpn\')">🤰 Pré-Natal</button>' +
    '<button class="tab-btn" onclick="mostrarAbaCert(\'epidemico\')">🦠 Epidemiológico</button>' +
    '</div>' +

    '<div id="abaCertGeral" style="display:block;">' +
    '<h2>Certificados Gerais</h2>' +
    '<div style="margin-bottom:20px;">' +
    '<select id="tipoCertificado" style="padding:10px;margin-right:10px;">' +
    '<option value="1">🧬 Genótipo</option>' +
    '<option value="2">🩺 Boa Saúde</option>' +
    '<option value="3">📋 Incapacidade</option>' +
    '<option value="4">💪 Aptidão</option>' +
    '<option value="5">🤰 Saúde Materna</option>' +
    '</select>' +
    '<button class="btn-criar" onclick="mostrarModalCertificado()">+ Novo Certificado</button>' +
    '</div>' +
    '<table><thead><tr><th>Número</th><th>Tipo</th><th>Paciente</th><th>Emissão</th><th>Validade</th><th>Status</th><th>Ações</th></tr></thead>' +
    '<tbody id="certificadosBody"></tbody></table>' +
    '</div>' +

    '<div id="abaCertCPN" style="display:none;">' +
    '<h2>🤰 Certificados Pré-Natal</h2>' +
    '<button class="btn-criar" onclick="mostrarModalCPN()">+ Novo CPN</button>' +
    '<table><thead><tr><th>Número</th><th>Paciente</th><th>BI</th><th>Genótipo</th><th>VIH</th><th>Emissão</th><th>Ações</th></tr></thead>' +
    '<tbody id="cpnBody"></tbody></table>' +
    '</div>' +

    '<div id="abaCertEpidemico" style="display:none;">' +
    '<h2>🦠 Certificados Epidemiológicos</h2>' +
    '<button class="btn-criar" onclick="mostrarModalEpidemico()">+ Novo Certificado</button>' +
    '<table><thead><tr><th>Número</th><th>Doença</th><th>Paciente</th><th>Resultado</th><th>Emissão</th><th>Ações</th></tr></thead>' +
    '<tbody id="epidemicoBody"></tbody></table>' +
    '</div>' +
    '</div>' +

    '<div id="secaoAlertas" style="display:none;">' +
    '<h1>🚨 Alertas de Segurança</h1>' +
    '<div id="alertasList"></div>' +
    '</div>' +
    '</div>' +

    // MODAIS (resumido por questões de espaço)
    '<div id="modalLab" class="modal">' +
    '<div class="modal-content">' +
    '<h2>Novo Laboratório</h2>' +
    '<input type="text" id="labNome" placeholder="Nome do laboratório">' +
    '<input type="text" id="labNIF" placeholder="NIF (10 dígitos)" maxlength="10">' +
    '<select id="labTipo"><option value="laboratorio">Laboratório</option><option value="hospital">Hospital</option><option value="clinica">Clínica</option></select>' +
    '<input type="text" id="labProvincia" placeholder="Província">' +
    '<input type="email" id="labEmail" placeholder="Email">' +
    '<p id="labNIFError" style="color:red;font-size:12px;display:none;">NIF deve ter 10 dígitos</p>' +
    '<button onclick="criarLaboratorio()" style="background:#006633;color:white;padding:10px;width:100%;">Criar</button>' +
    '<button onclick="fecharModal(\'modalLab\')">Cancelar</button>' +
    '</div></div>' +

    '<div id="modalHospital" class="modal">' +
    '<div class="modal-content">' +
    '<h2>Novo Hospital</h2>' +
    '<input type="text" id="hospitalNome" placeholder="Nome do hospital">' +
    '<input type="text" id="hospitalNIF" placeholder="NIF (10 dígitos)" maxlength="10">' +
    '<input type="text" id="hospitalProvincia" placeholder="Província">' +
    '<input type="text" id="hospitalDiretor" placeholder="Diretor">' +
    '<input type="email" id="hospitalEmail" placeholder="Email">' +
    '<button onclick="criarHospital()" style="background:#006633;color:white;padding:10px;width:100%;">Criar</button>' +
    '<button onclick="fecharModal(\'modalHospital\')">Cancelar</button>' +
    '</div></div>' +

    '<div id="modalEmpresa" class="modal">' +
    '<div class="modal-content">' +
    '<h2>Nova Empresa</h2>' +
    '<input type="text" id="empresaNome" placeholder="Nome da empresa">' +
    '<input type="text" id="empresaNIF" placeholder="NIF (10 dígitos)" maxlength="10">' +
    '<input type="text" id="empresaEndereco" placeholder="Endereço">' +
    '<input type="email" id="empresaEmail" placeholder="Email">' +
    '<h3>Responsável</h3>' +
    '<input type="text" id="respNome" placeholder="Nome do responsável">' +
    '<input type="text" id="respCargo" placeholder="Cargo">' +
    '<input type="email" id="respEmail" placeholder="Email do responsável">' +
    '<input type="text" id="respTelefone" placeholder="Telefone">' +
    '<button onclick="criarEmpresa()" style="background:#006633;color:white;padding:10px;width:100%;">Criar</button>' +
    '<button onclick="fecharModal(\'modalEmpresa\')">Cancelar</button>' +
    '</div></div>' +

    // Modais de certificados (resumido)
    '</div>' +

    '<script>' +
    'const token=localStorage.getItem("token");' +
    'const labKey=localStorage.getItem("labKey");' +
    'let acesso="";' +
    'if(labKey){' +
    'acesso="laboratorio";' +
    'document.getElementById("userType").innerText="🔬 Modo Laboratório";' +
    'document.getElementById("userType").className="user-badge badge-laboratorio";' +
    'document.getElementById("criarLabBtn").style.display="none";' +
    'document.getElementById("menuCertificados").style.display="block";' +
    'document.getElementById("menuAlertas").style.display="none";' +
    'mostrarWelcomeLab();' +
    '} else if(token){' +
    'acesso="ministerio";' +
    'document.getElementById("userType").innerText="🏛️ Modo Ministério";' +
    'document.getElementById("userType").className="user-badge badge-ministerio";' +
    'document.getElementById("criarLabBtn").style.display="block";' +
    'document.getElementById("menuCertificados").style.display="none";' +
    'document.getElementById("menuAlertas").style.display="block";' +
    '} else window.location.href="/";' +

    'function mostrarSecao(s){' +
    'document.getElementById("secaoDashboard").style.display="none";' +
    'document.getElementById("secaoLabs").style.display="none";' +
    'document.getElementById("secaoHospitais").style.display="none";' +
    'document.getElementById("secaoEmpresas").style.display="none";' +
    'document.getElementById("secaoCertificados").style.display="none";' +
    'document.getElementById("secaoAlertas").style.display="none";' +
    'if(s==="dashboard"){document.getElementById("secaoDashboard").style.display="block";carregarStats();}' +
    'if(s==="labs"){document.getElementById("secaoLabs").style.display="block";carregarLabs();}' +
    'if(s==="hospitais"){document.getElementById("secaoHospitais").style.display="block";carregarHospitais();}' +
    'if(s==="empresas"){document.getElementById("secaoEmpresas").style.display="block";carregarEmpresas();}' +
    'if(s==="certificados"){document.getElementById("secaoCertificados").style.display="block";carregarCertificados();}' +
    'if(s==="alertas"){document.getElementById("secaoAlertas").style.display="block";carregarAlertas();}}' +

    'function mostrarAbaCert(aba){' +
    'document.getElementById("abaCertGeral").style.display="none";' +
    'document.getElementById("abaCertCPN").style.display="none";' +
    'document.getElementById("abaCertEpidemico").style.display="none";' +
    'if(aba==="geral") document.getElementById("abaCertGeral").style.display="block";' +
    'if(aba==="cpn") document.getElementById("abaCertCPN").style.display="block";' +
    'if(aba==="epidemico") document.getElementById("abaCertEpidemico").style.display="block";}' +

    'function fecharModal(id){document.getElementById(id).style.display="none";}' +
    'function fecharWelcome(){document.getElementById("welcomeBanner").style.display="none";}' +

    'async function mostrarWelcomeLab(){' +
    'const headers={"x-api-key":labKey,"x-tipo-acesso":"laboratorio"};' +
    'const rLab=await fetch("/api/labs/me",{headers});' +
    'const lab=await rLab.json();' +
    'if(lab){' +
    'document.getElementById("welcomeBanner").style.display="block";' +
    'document.getElementById("welcomeLabName").innerHTML="🔬 "+lab.nome;' +
    'document.getElementById("welcomeLabProvincia").innerHTML=lab.provincia;' +
    'document.getElementById("welcomeLabTipo").innerHTML=lab.tipo;' +
    'document.getElementById("welcomeLabNIF").innerHTML=lab.nif;' +
    'document.getElementById("welcomeLabKey").innerHTML=lab.apiKey.substring(0,15)+"...";' +
    'document.getElementById("welcomeLabLastAccess").innerHTML=lab.ultimoAcesso?new Date(lab.ultimoAcesso).toLocaleString():"Primeiro acesso";' +
    'const rStats=await fetch("/api/stats/lab",{headers});' +
    'const stats=await rStats.json();' +
    'document.getElementById("welcomeLabStats").innerHTML="📊 Total: "+stats.total;' +
    '}}' +

    // Funções para criar entidades (resumido)
    'async function criarHospital(){' +
    'const nif=document.getElementById("hospitalNIF").value;' +
    'if(!/^\\d{10}$/.test(nif)){alert("NIF inválido");return;}' +
    'const dados={nome:document.getElementById("hospitalNome").value,nif,provincia:document.getElementById("hospitalProvincia").value,diretor:document.getElementById("hospitalDiretor").value,email:document.getElementById("hospitalEmail").value};' +
    'const r=await fetch("/api/hospitais",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},body:JSON.stringify(dados)});' +
    'const d=await r.json();' +
    'if(d.success){alert("✅ Hospital criado! Chave: "+d.chave);fecharModal("modalHospital");carregarHospitais();}' +
    'else alert("Erro: "+d.erro);}' +

    'async function criarEmpresa(){' +
    'const nif=document.getElementById("empresaNIF").value;' +
    'if(!/^\\d{10}$/.test(nif)){alert("NIF inválido");return;}' +
    'const dados={' +
    'nome:document.getElementById("empresaNome").value,nif,' +
    'endereco:document.getElementById("empresaEndereco").value,' +
    'email:document.getElementById("empresaEmail").value,' +
    'responsavel:{' +
    'nome:document.getElementById("respNome").value,' +
    'cargo:document.getElementById("respCargo").value,' +
    'email:document.getElementById("respEmail").value,' +
    'telefone:document.getElementById("respTelefone").value}};' +
    'const r=await fetch("/api/empresas",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},body:JSON.stringify(dados)});' +
    'const d=await r.json();' +
    'if(d.success){alert("✅ Empresa criada! Chave: "+d.chave);fecharModal("modalEmpresa");carregarEmpresas();}' +
    'else alert("Erro: "+d.erro);}' +

    'async function carregarHospitais(){' +
    'const r=await fetch("/api/hospitais",{headers:{"Authorization":"Bearer "+token}});' +
    'const lista=await r.json();' +
    'let html="";' +
    'lista.forEach(h=>{html+="<tr><td>"+h.nome+"</td><td>"+h.nif+"</td><td>"+h.provincia+"</td><td>"+h.diretor+"</td><td>"+(h.ativo?"✅ Ativo":"❌ Inativo")+' +
    '"</td><td><button onclick=\'desativarHospital(\\""+h._id+"\\")\'>Desativar</button></td></tr>";});' +
    'document.getElementById("hospitaisBody").innerHTML=html;}' +

    'async function carregarEmpresas(){' +
    'const r=await fetch("/api/empresas",{headers:{"Authorization":"Bearer "+token}});' +
    'const lista=await r.json();' +
    'let html="";' +
    'lista.forEach(e=>{html+="<tr><td>"+e.nome+"</td><td>"+e.nif+"</td><td>"+e.responsavel.nome+"</td><td>"+(e.ativo?"✅ Ativo":"❌ Inativo")+' +
    '"</td><td><button onclick=\'desativarEmpresa(\\""+e._id+"\\")\'>Desativar</button></td></tr>";});' +
    'document.getElementById("empresasBody").innerHTML=html;}' +

    'async function carregarStats(){' +
    'const r=await fetch("/api/stats",{headers:{"Authorization":"Bearer "+token}});' +
    'const d=await r.json();' +
    'document.getElementById("totalLabs").innerText=d.totalLabs||0;' +
    'document.getElementById("totalHospitais").innerText=d.totalHospitais||0;' +
    'document.getElementById("totalEmpresas").innerText=d.totalEmpresas||0;' +
    'document.getElementById("totalCerts").innerText=d.totalCertificados||0;' +
    'document.getElementById("totalCPN").innerText=d.totalCPN||0;' +
    'document.getElementById("totalEpi").innerText=d.totalEpidemicos||0;}' +

    'function logout(){localStorage.removeItem("token");localStorage.removeItem("labKey");window.location.href="/";}' +
    'mostrarSecao("dashboard");' +
    '</script>' +
    '</body></html>');
});

// ============================================
// API DE LOGIN
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
// API DE LABORATÓRIOS
// ============================================
app.post('/api/labs', authMiddleware, async (req, res) => {
    try {
        const dados = req.body;
        if (!dados.nif || !validarNIF(dados.nif)) return res.status(400).json({ erro: 'NIF inválido' });
        const labId = 'LAB-' + Date.now();
        const apiKey = gerarApiKey();
        const lab = new Lab({ ...dados, labId, apiKey });
        await lab.save();
        res.json({ success: true, lab: { labId, nome: lab.nome, nif: lab.nif, apiKey } });
    } catch (error) {
        if (error.code === 11000) return res.status(400).json({ erro: 'NIF já cadastrado' });
        res.status(500).json({ erro: 'Erro ao criar laboratório' });
    }
});

app.get('/api/labs', authMiddleware, async (req, res) => {
    try {
        const labs = await Lab.find({}, { apiKey: 0 });
        res.json(labs);
    } catch (error) { res.status(500).json({ erro: 'Erro ao buscar laboratórios' }); }
});

app.get('/api/labs/me', async (req, res) => {
    const apiKey = req.headers['x-api-key'];
    const lab = await Lab.findOne({ apiKey }, { apiKey: 0 });
    res.json(lab);
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
        const chaveAcesso = gerarChaveHospital(dados.nome);
        const hospital = new Hospital({ ...dados, chaveAcesso });
        await hospital.save();
        res.json({ success: true, chave: chaveAcesso, nome: hospital.nome });
    } catch (error) {
        if (error.code === 11000) return res.status(400).json({ erro: 'NIF já cadastrado' });
        res.status(500).json({ erro: 'Erro ao criar hospital' });
    }
});

app.get('/api/hospitais', authMiddleware, async (req, res) => {
    try {
        const hospitais = await Hospital.find({}, { chaveAcesso: 0 });
        res.json(hospitais);
    } catch (error) { res.status(500).json({ erro: 'Erro interno' }); }
});

// ============================================
// API DE EMPRESAS
// ============================================
app.post('/api/empresas', authMiddleware, async (req, res) => {
    try {
        const dados = req.body;
        if (!dados.nif || !validarNIF(dados.nif)) {
            return res.status(400).json({ erro: 'NIF da empresa inválido' });
        }
        const chaveAcesso = gerarChaveEmpresa(dados.nome, dados.nif);
        const empresa = new Empresa({ ...dados, chaveAcesso });
        await empresa.save();
        res.json({ success: true, chave: chaveAcesso, nome: empresa.nome });
    } catch (error) {
        if (error.code === 11000) return res.status(400).json({ erro: 'NIF já cadastrado' });
        res.status(500).json({ erro: 'Erro ao criar empresa' });
    }
});

app.get('/api/empresas', authMiddleware, async (req, res) => {
    try {
        const empresas = await Empresa.find({}, { chaveAcesso: 0 });
        res.json(empresas);
    } catch (error) { res.status(500).json({ erro: 'Erro interno' }); }
});

// ============================================
// API DE LEITURA UNIVERSAL (para apps)
// ============================================
app.post('/api/ler', identificarAcesso, async (req, res) => {
    try {
        const { hash } = req.body;
        
        // Procurar certificado em qualquer coleção
        let certificado = null;
        let tipoDoc = null;
        
        certificado = await Certificate.findOne({ hash });
        if (certificado) tipoDoc = 'certificado';
        
        if (!certificado) {
            certificado = await CPN.findOne({ hash });
            if (certificado) tipoDoc = 'cpn';
        }
        
        if (!certificado) {
            certificado = await Epidemico.findOne({ hash });
            if (certificado) tipoDoc = 'epidemico';
        }
        
        if (!certificado) {
            return res.status(404).json({ erro: 'Certificado não encontrado' });
        }
        
        // Registrar acesso
        await AcessoLog.create({
            tipoAcesso: req.accessType,
            entidadeId: req.accessId,
            entidadeNome: req.accessName,
            certificadoId: certificado.numero || certificado._id,
            tipoCertificado: certificado.tipo || (tipoDoc === 'cpn' ? 6 : 7),
            ip: req.ip
        });
        
        // Aplicar regras por tipo de acesso
        switch(req.accessType) {
            case 'genlove':
                if (tipoDoc !== 'certificado' || certificado.tipo !== 1) {
                    return res.status(403).json({ erro: 'Genlove só pode aceder a genótipo' });
                }
                return res.json({
                    sucesso: true,
                    dados: certificado.dadosGenlove
                });
                
            case 'laboratorio':
            case 'hospital':
                // Vêem tudo
                return res.json({
                    sucesso: true,
                    tipo: tipoDoc,
                    dados: certificado
                });
                
            case 'empresa':
                if (tipoDoc !== 'certificado' || ![3,4].includes(certificado.tipo)) {
                    return res.status(403).json({ erro: 'Empresa só pode aceder a aptidão/incapacidade' });
                }
                if (certificado.tipo === 3) {
                    return res.json({
                        sucesso: true,
                        dados: {
                            nome: certificado.paciente.nomeCompleto,
                            periodoInicio: certificado.dados.periodoInicio,
                            periodoFim: certificado.dados.periodoFim,
                            dias: certificado.dados.diasIncapacidade
                        }
                    });
                } else {
                    return res.json({
                        sucesso: true,
                        dados: {
                            nome: certificado.paciente.nomeCompleto,
                            avaliacao: certificado.dados.avaliacao,
                            restricoes: certificado.dados.restricoes
                        }
                    });
                }
        }
        
    } catch (error) {
        res.status(500).json({ erro: 'Erro interno' });
    }
});

// ============================================
// ROTA ESPECÍFICA PARA GENLOVE (mantida por compatibilidade)
// ============================================
app.post('/api/genlove/verificar', async (req, res) => {
    const apiKey = req.headers['x-api-key'];
    if (!GENLOVE_KEYS.includes(apiKey)) {
        return res.status(401).json({ erro: 'Chave Genlove inválida' });
    }
    
    try {
        const { hash } = req.body;
        const certificado = await Certificate.findOne({ hash });
        
        if (!certificado || certificado.tipo !== 1) {
            return res.json({ valido: false });
        }
        
        res.json({
            valido: true,
            dados: certificado.dadosGenlove
        });
        
    } catch (error) {
        res.status(500).json({ erro: 'Erro interno' });
    }
});

// ============================================
// ESTATÍSTICAS
// ============================================
app.get('/api/stats', authMiddleware, async (req, res) => {
    try {
        const stats = {
            totalLabs: await Lab.countDocuments({ ativo: true }),
            totalHospitais: await Hospital.countDocuments({ ativo: true }),
            totalEmpresas: await Empresa.countDocuments({ ativo: true }),
            totalCertificados: await Certificate.countDocuments(),
            totalCPN: await CPN.countDocuments(),
            totalEpidemicos: await Epidemico.countDocuments()
        };
        res.json(stats);
    } catch (err) { res.status(500).json({ erro: 'Erro interno' }); }
});

app.get('/api/stats/lab', async (req, res) => {
    const apiKey = req.headers['x-api-key'];
    const lab = await Lab.findOne({ apiKey });
    if (!lab) return res.status(401).json({ erro: 'Não autorizado' });
    
    const total = await Certificate.countDocuments({ emitidoPor: lab._id }) +
                  await CPN.countDocuments({ emitidoPor: lab._id }) +
                  await Epidemico.countDocuments({ emitidoPor: lab._id });
    
    res.json({ total });
});

// ============================================
// INICIAR SERVIDOR
// ============================================
app.listen(PORT, () => {
    console.log('\n' + '='.repeat(50));
    console.log('🚀 SNS - SISTEMA NACIONAL DE SAÚDE');
    console.log('='.repeat(50));
    console.log('📱 URL: http://localhost:' + PORT);
    console.log('🏛️ Ministério: admin@sns.gov.ao / Admin@2025');
    console.log('🔬 Laboratório: /lab-login com API Key');
    console.log('🏥 Hospitais: Chave por hospital');
    console.log('🏢 Empresas: Chave por empresa (NIF da empresa)');
    console.log('💘 Genlove: Chave fixa no código');
    console.log('='.repeat(50) + '\n');
});