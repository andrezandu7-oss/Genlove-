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

async function enviarEmail(destinatario, assunto, mensagem) {
    console.log(`📧 Email enviado para ${destinatario}: ${assunto}`);
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
            naoSolicitado: { type: Boolean, default: false },
            consentimento: Boolean
        },
        malaria: { 
            realizado: Boolean, 
            resultado: { type: String, enum: ['Negativo', 'Positivo', '3000 P/L'] },
            naoSolicitado: { type: Boolean, default: false },
            consentimento: Boolean
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
        },
        urina: { 
            realizado: Boolean, 
            resultado: String,
            naoSolicitado: { type: Boolean, default: false }
        }
    },
    prevencao: {
        vacinaTetano: { doses: Number, completo: Boolean },
        fansidar: { doses: Number, completo: Boolean },
        ferro: Boolean,
        mosquiteiro: Boolean
    },
    consultas: { type: Number, default: 0 },
    medicoResponsavel: String,
    unidadeSanitaria: String,
    emitidoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Lab' },
    emitidoEm: { type: Date, default: Date.now },
    hash: { type: String, unique: true }
});

const User = mongoose.model('User', userSchema);
const Lab = mongoose.model('Lab', labSchema);
const Certificate = mongoose.model('Certificate', certificateSchema);
const CPN = mongoose.model('CPN', cpnSchema);

// ============================================
// MIDDLEWARES
// ============================================
const identificarAcesso = async (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (apiKey) {
        const lab = await Lab.findOne({ apiKey, ativo: true });
        if (lab) {
            req.acesso = 'laboratorio';
            req.lab = lab;
            return next();
        }
    }
    
    const token = req.headers['authorization']?.split(' ')[1];
    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret-key');
            const user = await User.findById(decoded.id);
            if (user) {
                req.acesso = 'ministerio';
                req.user = user;
                return next();
            }
        } catch (err) {}
    }
    
    res.status(401).json({ erro: 'Não autorizado' });
};

const deteccaoPartilhaMiddleware = async (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (apiKey) {
        const lab = await Lab.findOne({ apiKey, ativo: true });
        if (lab) {
            const ip = req.ip || req.connection.remoteAddress;
            const userAgent = req.headers['user-agent'];
            const agora = new Date();
            const hora = agora.getHours();
            const dia = agora.getDay();

            const dispositivoExistente = lab.dispositivos.find(
                d => d.ip === ip && d.userAgent === userAgent
            );

            if (!dispositivoExistente) {
                lab.dispositivos.push({
                    ip,
                    userAgent,
                    primeiroAcesso: agora,
                    ultimoAcesso: agora,
                    totalEmissoesNesteDispositivo: 1
                });

                if (lab.dispositivos.length >= 3) {
                    lab.alertas.push({
                        tipo: 'MULTIPLOS_IPS',
                        descricao: `Chave utilizada em ${lab.dispositivos.length} dispositivos diferentes.`
                    });
                }
            } else {
                dispositivoExistente.ultimoAcesso = agora;
                dispositivoExistente.totalEmissoesNesteDispositivo++;
            }

            const horarioNormal = (dia >= 1 && dia <= 5 && hora >= 8 && hora <= 18);
            if (!horarioNormal) {
                lab.alertas.push({
                    tipo: 'HORARIO_ATIPICO',
                    descricao: `Emissão em horário atípico: ${hora}h, dia ${dia}`
                });
            }

            lab.ultimoAcesso = agora;
            await lab.save();
        }
    }
    next();
};

const labMiddleware = async (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) return res.status(401).json({ erro: 'API Key não fornecida' });
    
    const lab = await Lab.findOne({ apiKey, ativo: true });
    if (!lab) return res.status(401).json({ erro: 'API Key inválida' });
    
    req.lab = lab;
    next();
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
    '.cpn-badge{background:#f3e5f5;color:#4a148c;}' +
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
    '<a href="#" onclick="mostrarSecao(\'certificados\')">📋 Certificados</a>' +
    '<a href="#" onclick="mostrarSecao(\'cpn\')">🤰 Pré-Natal</a>' +
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
    '<div class="stat-card"><h3>Certificados</h3><div class="value" id="totalCerts">0</div></div>' +
    '<div class="stat-card"><h3>Pré-Natal</h3><div class="value" id="totalCPN">0</div></div>' +
    '</div>' +
    '<div class="stats" style="grid-template-columns:repeat(3,1fr);">' +
    '<div class="stat-card"><h3>🧬 Genótipo</h3><div class="value" id="tipo1">0</div></div>' +
    '<div class="stat-card"><h3>🤰 Grávidas VIH+</h3><div class="value" id="vihPositivo">0</div></div>' +
    '<div class="stat-card"><h3>🦟 Malária</h3><div class="value" id="malariaPositivo">0</div></div>' +
    '</div>' +
    '</div>' +

    '<div id="secaoLabs" style="display:none;">' +
    '<h1>Laboratórios</h1>' +
    '<button class="btn-criar" id="criarLabBtn" onclick="mostrarModalLab()">+ Novo Laboratório</button>' +
    '<table><thead><tr><th>ID</th><th>Nome</th><th>NIF</th><th>Tipo</th><th>Província</th><th>Status</th><th>Ações</th></tr></thead>' +
    '<tbody id="labsBody"></tbody></table>' +
    '</div>' +

    '<div id="secaoCertificados" style="display:none;">' +
    '<h1>Certificados</h1>' +
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

    '<div id="secaoCpn" style="display:none;">' +
    '<h1>🤰 Certificados Pré-Natal</h1>' +
    '<button class="btn-criar" onclick="mostrarModalCPN()">+ Novo CPN</button>' +
    '<table><thead><tr><th>Número</th><th>Paciente</th><th>BI</th><th>Genótipo</th><th>VIH</th><th>Malária</th><th>Emissão</th><th>Ações</th></tr></thead>' +
    '<tbody id="cpnBody"></tbody></table>' +
    '</div>' +

    '<div id="secaoAlertas" style="display:none;">' +
    '<h1>🚨 Alertas de Segurança</h1>' +
    '<div id="alertasList"></div>' +
    '</div>' +
    '</div>' +

    '<div id="modalLab" class="modal">' +
    '<div class="modal-content">' +
    '<h2>Novo Laboratório</h2>' +
    '<input type="text" id="labNome" placeholder="Nome do laboratório">' +
    '<input type="text" id="labNIF" placeholder="NIF (10 dígitos)" maxlength="10">' +
    '<select id="labTipo"><option value="laboratorio">Laboratório</option><option value="hospital">Hospital</option><option value="clinica">Clínica</option></select>' +
    '<input type="text" id="labProvincia" placeholder="Província">' +
    '<input type="text" id="labMunicipio" placeholder="Município">' +
    '<input type="email" id="labEmail" placeholder="Email">' +
    '<p id="labNIFError" style="color:red;font-size:12px;display:none;">NIF deve ter 10 dígitos</p>' +
    '<button onclick="criarLaboratorio()" style="background:#006633;color:white;padding:10px;width:100%;">Criar</button>' +
    '<button onclick="fecharModal(\'modalLab\')" style="margin-top:10px;">Cancelar</button>' +
    '</div>' +
    '</div>' +

    '<div id="modalCPN" class="modal">' +
    '<div class="modal-content">' +
    '<h2>🤰 Certificado Pré-Natal</h2>' +
    '<p style="color:#006633;font-size:14px;margin-bottom:15px;" id="cpnLabInfo"></p>' +

    '<h3>📋 Identificação</h3>' +
    '<input type="text" id="cpnNome" placeholder="Nome completo da gestante">' +
    '<input type="date" id="cpnDataNasc" placeholder="Data nascimento">' +
    '<input type="text" id="cpnBI" placeholder="BI">' +
    '<input type="text" id="cpnTelefone" placeholder="Telefone">' +
    '<input type="text" id="cpnProvincia" placeholder="Província">' +
    '<input type="text" id="cpnMunicipio" placeholder="Município">' +

    '<h3>📊 Dados Obstétricos</h3>' +
    '<input type="number" id="cpnGestacoes" placeholder="Nº gestações" value="1" min="1">' +
    '<input type="number" id="cpnPartos" placeholder="Nº partos" value="0" min="0">' +
    '<input type="number" id="cpnCesarianas" placeholder="Nº cesarianas" value="0" min="0">' +
    '<input type="number" id="cpnAbortos" placeholder="Nº abortos" value="0" min="0">' +
    '<input type="date" id="cpnDPP" placeholder="Data provável do parto">' +
    '<input type="number" id="cpnIG" placeholder="Idade gestacional (semanas)" min="0" max="42">' +
    '<label><input type="checkbox" id="cpnRisco"> Gravidez de alto risco</label>' +

    '<h3>🧬 Genótipo</h3>' +
    '<select id="cpnGenotipo">' +
    '<option value="">Selecione...</option>' +
    '<option value="AA">AA</option>' +
    '<option value="AS">AS</option>' +
    '<option value="SS">SS</option>' +
    '<option value="NAO">Não solicitado</option>' +
    '</select>' +

    '<h3>🩸 Grupo Sanguíneo</h3>' +
    '<select id="cpnGrupo">' +
    '<option value="">Selecione...</option>' +
    '<option value="A+">A+</option><option value="A-">A-</option>' +
    '<option value="B+">B+</option><option value="B-">B-</option>' +
    '<option value="AB+">AB+</option><option value="AB-">AB-</option>' +
    '<option value="O+">O+</option><option value="O-">O-</option>' +
    '<option value="NAO">Não solicitado</option>' +
    '</select>' +

    '<h3>🦠 Exames (com consentimento)</h3>' +
    '<select id="cpnVIH">' +
    '<option value="">VIH...</option>' +
    '<option value="Negativo">Negativo</option>' +
    '<option value="Positivo">Positivo</option>' +
    '<option value="NAO">Não solicitado</option>' +
    '</select>' +

    '<select id="cpnMalaria">' +
    '<option value="">Malária...</option>' +
    '<option value="Negativo">Negativo</option>' +
    '<option value="Positivo">Positivo</option>' +
    '<option value="3000 P/L">3000 P/L</option>' +
    '<option value="NAO">Não solicitado</option>' +
    '</select>' +

    '<select id="cpnSifilis">' +
    '<option value="">Sífilis (VDRL)...</option>' +
    '<option value="Negativo">Negativo</option>' +
    '<option value="Positivo">Positivo</option>' +
    '<option value="NAO">Não solicitado</option>' +
    '</select>' +

    '<input type="number" id="cpnHemoglobina" placeholder="Hemoglobina (g/dL)" step="0.1">' +
    '<label><input type="checkbox" id="cpnHemoglobinaNao"> Não solicitado</label><br>' +

    '<select id="cpnHepatiteB">' +
    '<option value="">Hepatite B...</option>' +
    '<option value="Negativo">Negativo</option>' +
    '<option value="Positivo">Positivo</option>' +
    '<option value="NAO">Não solicitado</option>' +
    '</select>' +

    '<input type="number" id="cpnGlicemia" placeholder="Glicemia (mg/dL)">' +
    '<label><input type="checkbox" id="cpnGlicemiaNao"> Não solicitado</label><br>' +

    '<h3>💉 Prevenção</h3>' +
    '<input type="number" id="cpnVacina" placeholder="Doses vacina tétano" min="0" max="3" value="0">' +
    '<input type="number" id="cpnFansidar" placeholder="Doses Fansidar" min="0" max="4" value="0">' +
    '<label><input type="checkbox" id="cpnFerro"> Suplementação de ferro</label><br>' +
    '<label><input type="checkbox" id="cpnMosquiteiro"> Mosquiteiro tratado</label><br>' +

    '<h3>🏥 Responsável</h3>' +
    '<input type="text" id="cpnMedico" placeholder="Médico responsável">' +
    '<input type="text" id="cpnUnidade" placeholder="Unidade sanitária">' +

    '<button onclick="emitirCPN()" style="background:#006633;color:white;padding:10px;width:100%;margin-top:20px;">✅ Emitir Certificado Pré-Natal</button>' +
    '<button onclick="fecharModal(\'modalCPN\')" style="margin-top:10px;">Cancelar</button>' +
    '</div>' +
    '</div>' +

    '<script>' +
    'const token=localStorage.getItem("token");' +
    'const labKey=localStorage.getItem("labKey");' +
    'let acesso="";' +
    'let labInfo=null;' +
    'if(labKey){' +
    'acesso="laboratorio";' +
    'document.getElementById("userType").innerText="🔬 Modo Laboratório";' +
    'document.getElementById("userType").className="user-badge badge-laboratorio";' +
    'document.getElementById("criarLabBtn").style.display="none";' +
    'document.getElementById("menuAlertas").style.display="none";' +
    '} else if(token){' +
    'acesso="ministerio";' +
    'document.getElementById("userType").innerText="🏛️ Modo Ministério";' +
    'document.getElementById("userType").className="user-badge badge-ministerio";' +
    'document.getElementById("menuAlertas").style.display="block";' +
    '} else window.location.href="/";' +

    'function mostrarSecao(s){' +
    'document.getElementById("secaoDashboard").style.display="none";' +
    'document.getElementById("secaoLabs").style.display="none";' +
    'document.getElementById("secaoCertificados").style.display="none";' +
    'document.getElementById("secaoCpn").style.display="none";' +
    'document.getElementById("secaoAlertas").style.display="none";' +
    'if(s==="dashboard"){document.getElementById("secaoDashboard").style.display="block";carregarStats();}' +
    'if(s==="labs"){document.getElementById("secaoLabs").style.display="block";carregarLabs();}' +
    'if(s==="certificados"){document.getElementById("secaoCertificados").style.display="block";carregarCertificados();}' +
    'if(s==="cpn"){document.getElementById("secaoCpn").style.display="block";carregarCPN();}' +
    'if(s==="alertas"){document.getElementById("secaoAlertas").style.display="block";carregarAlertas();}}' +

    'function mostrarModalLab(){document.getElementById("modalLab").style.display="flex";}' +
    'function mostrarModalCPN(){document.getElementById("modalCPN").style.display="flex";if(labInfo)document.getElementById("cpnLabInfo").innerHTML="🔬 Emitindo como: "+labInfo.nome;}' +
    'function fecharModal(id){document.getElementById(id).style.display="none";}' +
    'function fecharWelcome(){document.getElementById("welcomeBanner").style.display="none";}' +

    'async function criarLaboratorio(){' +
    'const nif=document.getElementById("labNIF").value;' +
    'if(!/^\\d{10}$/.test(nif)){' +
    'document.getElementById("labNIFError").style.display="block";return;}' +
    'const lab={nome:document.getElementById("labNome").value,nif,tipo:document.getElementById("labTipo").value,provincia:document.getElementById("labProvincia").value,municipio:document.getElementById("labMunicipio").value,email:document.getElementById("labEmail").value};' +
    'const r=await fetch("/api/labs",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},body:JSON.stringify(lab)});' +
    'const d=await r.json();' +
    'if(d.success){alert("✅ Laboratório criado! API Key: "+d.lab.apiKey);fecharModal("modalLab");carregarLabs();}' +
    'else alert("Erro: "+d.erro);}' +

    'async function carregarLabs(){' +
    'let headers={"Content-Type":"application/json"};' +
    'if(acesso==="laboratorio") headers["x-api-key"]=labKey;' +
    'else headers["Authorization"]="Bearer "+token;' +
    'const r=await fetch("/api/labs",{headers});' +
    'const labs=await r.json();' +
    'let html="";' +
    'if(acesso==="laboratorio" && labs.length>0){' +
    'labInfo=labs[0];' +
    'document.getElementById("welcomeLabName").innerHTML="🔬 "+labInfo.nome;' +
    'document.getElementById("welcomeLabProvincia").innerHTML=labInfo.provincia;' +
    'document.getElementById("welcomeLabTipo").innerHTML=labInfo.tipo;' +
    'document.getElementById("welcomeLabNIF").innerHTML=labInfo.nif;' +
    'document.getElementById("welcomeLabKey").innerHTML=labInfo.apiKey?labInfo.apiKey.substring(0,15)+"...":"N/A";' +
    'document.getElementById("welcomeLabLastAccess").innerHTML=labInfo.ultimoAcesso?new Date(labInfo.ultimoAcesso).toLocaleString():"Primeiro acesso";' +
    'fetch("/api/stats",{headers:{"x-api-key":labKey}}).then(r=>r.json()).then(stats=>{' +
    'document.getElementById("welcomeLabStats").innerHTML=stats.totalCertificados+" certificados";' +
    '}).catch(()=>{document.getElementById("welcomeLabStats").innerHTML="0 certificados";});' +
    'document.getElementById("welcomeBanner").style.display="block";' +
    '}' +
    'labs.forEach(l=>{html+="<tr><td>"+(l.labId||"-")+"</td><td>"+l.nome+"</td><td>"+l.nif+"</td><td>"+l.tipo+"</td><td>"+l.provincia+"</td><td>"+(l.ativo?"✅ Ativo":"❌ Inativo")+' +
    '"</td><td>"+(acesso==="ministerio"?\'<button onclick="verAlertasLab(\\""+l._id+"\\")">🚨</button> <button onclick="desativarLab(\\""+l._id+"\\")">Desativar</button>\':"🔬 Meu Lab")+"</td></tr>";});' +
    'document.getElementById("labsBody").innerHTML=html;}' +

    'async function desativarLab(id){' +
    'if(!confirm("Tem certeza?"))return;' +
    'const r=await fetch("/api/labs/"+id,{method:"DELETE",headers:{"Authorization":"Bearer "+token}});' +
    'if(r.ok){alert("Laboratório desativado");carregarLabs();}}' +

    'async function emitirCPN(){' +
    'const paciente={' +
    'nomeCompleto:document.getElementById("cpnNome").value,' +
    'dataNascimento:document.getElementById("cpnDataNasc").value,' +
    'bi:document.getElementById("cpnBI").value,' +
    'telefone:document.getElementById("cpnTelefone").value,' +
    'provincia:document.getElementById("cpnProvincia").value,' +
    'municipio:document.getElementById("cpnMunicipio").value};' +

    'const exames={' +
    'genotipo:{realizado:!!document.getElementById("cpnGenotipo").value,resultado:document.getElementById("cpnGenotipo").value,naoSolicitado:document.getElementById("cpnGenotipo").value==="NAO"},' +
    'grupoSanguineo:{realizado:!!document.getElementById("cpnGrupo").value,resultado:document.getElementById("cpnGrupo").value,naoSolicitado:document.getElementById("cpnGrupo").value==="NAO"},' +
    'vih:{realizado:!!document.getElementById("cpnVIH").value,resultado:document.getElementById("cpnVIH").value,naoSolicitado:document.getElementById("cpnVIH").value==="NAO"},' +
    'malaria:{realizado:!!document.getElementById("cpnMalaria").value,resultado:document.getElementById("cpnMalaria").value,naoSolicitado:document.getElementById("cpnMalaria").value==="NAO"},' +
    'sifilis:{realizado:!!document.getElementById("cpnSifilis").value,resultado:document.getElementById("cpnSifilis").value,naoSolicitado:document.getElementById("cpnSifilis").value==="NAO"},' +
    'hemoglobina:{realizado:!!document.getElementById("cpnHemoglobina").value,valor:document.getElementById("cpnHemoglobina").value,naoSolicitado:document.getElementById("cpnHemoglobinaNao").checked},' +
    'hepatiteB:{realizado:!!document.getElementById("cpnHepatiteB").value,resultado:document.getElementById("cpnHepatiteB").value,naoSolicitado:document.getElementById("cpnHepatiteB").value==="NAO"},' +
    'glicemia:{realizado:!!document.getElementById("cpnGlicemia").value,valor:document.getElementById("cpnGlicemia").value,naoSolicitado:document.getElementById("cpnGlicemiaNao").checked}};' +

    'const dados={' +
    'paciente,' +
    'obstetricos:{' +
    'gestacoes:document.getElementById("cpnGestacoes").value,' +
    'partos:document.getElementById("cpnPartos").value,' +
    'cesarianas:document.getElementById("cpnCesarianas").value,' +
    'abortos:document.getElementById("cpnAbortos").value,' +
    'dpp:document.getElementById("cpnDPP").value,' +
    'ig:document.getElementById("cpnIG").value,' +
    'risco:document.getElementById("cpnRisco").checked},' +
    'exames,' +
    'prevencao:{' +
    'vacinaTetano:{doses:document.getElementById("cpnVacina").value},' +
    'fansidar:{doses:document.getElementById("cpnFansidar").value},' +
    'ferro:document.getElementById("cpnFerro").checked,' +
    'mosquiteiro:document.getElementById("cpnMosquiteiro").checked},' +
    'medicoResponsavel:document.getElementById("cpnMedico").value,' +
    'unidadeSanitaria:document.getElementById("cpnUnidade").value};' +

    'const r=await fetch("/api/cpn/emitir",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":labKey},body:JSON.stringify(dados)});' +
    'const data=await r.json();' +
    'if(data.success){alert("✅ Certificado Pré-Natal emitido! Nº: "+data.numero);fecharModal("modalCPN");carregarCPN();}' +
    'else alert("Erro: "+data.erro);}' +

    'async function carregarCPN(){' +
    'let headers={"Content-Type":"application/json"};' +
    'if(acesso==="laboratorio") headers["x-api-key"]=labKey;' +
    'else headers["Authorization"]="Bearer "+token;' +
    'const r=await fetch("/api/cpn",{headers});' +
    'const lista=await r.json();' +
    'let html="";' +
    'lista.forEach(c=>{' +
    'const geno=c.exames.genotipo.naoSolicitado?"Não solicitado":(c.exames.genotipo.resultado||"-");' +
    'const vih=c.exames.vih.naoSolicitado?"Não solicitado":(c.exames.vih.resultado||"-");' +
    'const malaria=c.exames.malaria.naoSolicitado?"Não solicitado":(c.exames.malaria.resultado||"-");' +
    'html+="<tr><td>"+c.numero+"</td><td>"+c.paciente.nomeCompleto+"</td><td>"+c.paciente.bi+"</td><td>"+geno+"</td><td>"+vih+"</td><td>"+malaria+"</td><td>"+new Date(c.emitidoEm).toLocaleDateString()+"</td><td><button onclick=\'downloadPDFCPN(\\""+c.numero+"\\")\'>📥 PDF</button></td></tr>";});' +
    'document.getElementById("cpnBody").innerHTML=html;}' +

    'function downloadPDFCPN(numero){window.open("/api/cpn/"+numero+"/pdf", "_blank");}' +

    'async function carregarStats(){' +
    'let headers={"Content-Type":"application/json"};' +
    'if(acesso==="laboratorio") headers["x-api-key"]=labKey;' +
    'else headers["Authorization"]="Bearer "+token;' +
    'const r=await fetch("/api/stats",{headers});' +
    'const d=await r.json();' +
    'document.getElementById("totalLabs").innerText=d.totalLabs||0;' +
    'document.getElementById("totalCerts").innerText=d.totalCertificados||0;' +
    'document.getElementById("totalCPN").innerText=d.totalCPN||0;' +
    'document.getElementById("tipo1").innerText=d.tipo1||0;' +
    'document.getElementById("vihPositivo").innerText=d.vihPositivo||0;' +
    'document.getElementById("malariaPositivo").innerText=d.malariaPositivo||0;}' +

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

app.get('/api/labs', identificarAcesso, async (req, res) => {
    try {
        if (req.acesso === 'laboratorio') {
            const lab = await Lab.findById(req.lab._id, { apiKey: 0 });
            return res.json([lab]);
        }
        const labs = await Lab.find({}, { apiKey: 0 });
        res.json(labs);
    } catch (error) { res.status(500).json({ erro: 'Erro ao buscar laboratórios' }); }
});

app.delete('/api/labs/:id', authMiddleware, async (req, res) => {
    try { await Lab.findByIdAndUpdate(req.params.id, { ativo: false }); res.json({ success: true }); }
    catch (error) { res.status(500).json({ erro: 'Erro interno' }); }
});

// ============================================
// API DE CERTIFICADOS PRÉ-NATAL (CPN)
// ============================================
app.post('/api/cpn/emitir', labMiddleware, deteccaoPartilhaMiddleware, async (req, res) => {
    try {
        const dados = req.body;
        const numero = gerarNumeroCPN();
        const hash = crypto.createHash('sha256').update(numero + JSON.stringify(dados) + Date.now()).digest('hex');
        
        const cpn = new CPN({
            numero,
            paciente: dados.paciente,
            obstetricos: dados.obstetricos,
            exames: dados.exames,
            prevencao: dados.prevencao,
            medicoResponsavel: dados.medicoResponsavel,
            unidadeSanitaria: dados.unidadeSanitaria,
            emitidoPor: req.lab._id,
            hash
        });
        await cpn.save();
        
        req.lab.totalEmissoes = (req.lab.totalEmissoes || 0) + 1;
        req.lab.ultimoAcesso = new Date();
        await req.lab.save();
        
        res.json({ success: true, numero: cpn.numero });
    } catch (error) { res.status(500).json({ erro: 'Erro ao emitir CPN' }); }
});

app.get('/api/cpn', identificarAcesso, async (req, res) => {
    try {
        let query = {};
        if (req.acesso === 'laboratorio') query.emitidoPor = req.lab._id;
        const lista = await CPN.find(query).sort({ emitidoEm: -1 }).limit(50);
        res.json(lista);
    } catch (error) { res.status(500).json({ erro: 'Erro ao buscar CPN' }); }
});

// ============================================
// PDF DO CERTIFICADO PRÉ-NATAL
// ============================================
app.get('/api/cpn/:numero/pdf', async (req, res) => {
    try {
        const cpn = await CPN.findOne({ numero: req.params.numero }).populate('emitidoPor', 'nome');
        if (!cpn) return res.status(404).json({ erro: 'CPN não encontrado' });

        const doc = new PDFDocument({ size: 'A4', margins: { top: 50, bottom: 50, left: 50, right: 50 } });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=cpn-' + cpn.numero + '.pdf');
        doc.pipe(res);

        doc.fontSize(20).fillColor('#006633').text('REPÚBLICA DE ANGOLA', { align: 'center' })
           .fontSize(16).text('MINISTÉRIO DA SAÚDE', { align: 'center' })
           .fontSize(24).text('CERTIFICADO DE SAÚDE MATERNA', { align: 'center' })
           .fontSize(14).text('PRÉ-NATAL', { align: 'center' }).moveDown(2)
           .fontSize(12).fillColor('black').text('Nº: ' + cpn.numero, { align: 'right' }).moveDown();

        doc.fontSize(14).fillColor('#006633').text('IDENTIFICAÇÃO', { underline: true })
           .fontSize(12).fillColor('black')
           .text('Nome: ' + cpn.paciente.nomeCompleto)
           .text('Data Nascimento: ' + new Date(cpn.paciente.dataNascimento).toLocaleDateString('pt-AO'))
           .text('BI: ' + cpn.paciente.bi).moveDown();

        doc.fontSize(14).fillColor('#006633').text('DADOS OBSTÉTRICOS', { underline: true })
           .fontSize(12).fillColor('black')
           .text(`Gestações: ${cpn.obstetricos.gestacoes} | Partos: ${cpn.obstetricos.partos} | Cesarianas: ${cpn.obstetricos.cesarianas} | Abortos: ${cpn.obstetricos.abortos}`)
           .text('DPP: ' + (cpn.obstetricos.dpp ? new Date(cpn.obstetricos.dpp).toLocaleDateString('pt-AO') : 'N/A'))
           .text('IG: ' + (cpn.obstetricos.ig || 'N/A') + ' semanas')
           .text('Gravidez de Risco: ' + (cpn.obstetricos.risco ? 'SIM' : 'NÃO')).moveDown();

        doc.fontSize(14).fillColor('#006633').text('EXAMES LABORATORIAIS', { underline: true });

        const exames = [
            ['Genótipo', cpn.exames.genotipo.naoSolicitado ? 'Não solicitado' : cpn.exames.genotipo.resultado],
            ['Grupo Sanguíneo', cpn.exames.grupoSanguineo.naoSolicitado ? 'Não solicitado' : cpn.exames.grupoSanguineo.resultado],
            ['VIH', cpn.exames.vih.naoSolicitado ? 'Não solicitado' : cpn.exames.vih.resultado],
            ['Malária', cpn.exames.malaria.naoSolicitado ? 'Não solicitado' : cpn.exames.malaria.resultado],
            ['Sífilis', cpn.exames.sifilis.naoSolicitado ? 'Não solicitado' : cpn.exames.sifilis.resultado],
            ['Hemoglobina', cpn.exames.hemoglobina.naoSolicitado ? 'Não solicitado' : (cpn.exames.hemoglobina.valor + ' g/dL')],
            ['Hepatite B', cpn.exames.hepatiteB.naoSolicitado ? 'Não solicitado' : cpn.exames.hepatiteB.resultado],
            ['Glicemia', cpn.exames.glicemia.naoSolicitado ? 'Não solicitado' : (cpn.exames.glicemia.valor + ' mg/dL')]
        ];

        exames.forEach(([nome, valor]) => {
            doc.fontSize(12).fillColor('black').text(nome + ': ' + valor);
        });
        doc.moveDown();

        doc.fontSize(14).fillColor('#006633').text('PREVENÇÃO', { underline: true })
           .fontSize(12).fillColor('black')
           .text('Vacina Anti-Tetânica: ' + cpn.prevencao.vacinaTetano.doses + '/3 doses')
           .text('Fansidar: ' + cpn.prevencao.fansidar.doses + '/4 doses')
           .text('Suplementação de Ferro: ' + (cpn.prevencao.ferro ? 'Sim' : 'Não'))
           .text('Mosquiteiro Tratado: ' + (cpn.prevencao.mosquiteiro ? 'Sim' : 'Não')).moveDown();

        doc.fontSize(14).fillColor('#006633').text('RESPONSÁVEL', { underline: true })
           .fontSize(12).fillColor('black')
           .text('Médico: ' + cpn.medicoResponsavel)
           .text('Unidade: ' + cpn.unidadeSanitaria).moveDown();

        doc.fontSize(10).fillColor('gray')
           .text('Documento emitido eletronicamente com valor legal', { align: 'center' })
           .text('Data: ' + new Date(cpn.emitidoEm).toLocaleDateString('pt-AO'), { align: 'center' });

        doc.end();
    } catch (error) { res.status(500).json({ erro: 'Erro ao gerar PDF' }); }
});

// ============================================
// ESTATÍSTICAS
// ============================================
app.get('/api/stats', identificarAcesso, async (req, res) => {
    try {
        const hoje = new Date(); hoje.setHours(0,0,0,0);
        const stats = { totalLabs: 0, totalCertificados: 0, totalCPN: 0, tipo1: 0, vihPositivo: 0, malariaPositivo: 0 };

        if (req.acesso === 'laboratorio') {
            stats.totalLabs = 1;
            stats.totalCertificados = await Certificate.countDocuments({ emitidoPor: req.lab._id });
            stats.totalCPN = await CPN.countDocuments({ emitidoPor: req.lab._id });
            stats.tipo1 = await Certificate.countDocuments({ tipo: 1, emitidoPor: req.lab._id });
            
            const cpns = await CPN.find({ emitidoPor: req.lab._id });
            stats.vihPositivo = cpns.filter(c => c.exames.vih.resultado === 'Positivo').length;
            stats.malariaPositivo = cpns.filter(c => c.exames.malaria.resultado === 'Positivo' || c.exames.malaria.resultado === '3000 P/L').length;
        } else {
            stats.totalLabs = await Lab.countDocuments({ ativo: true });
            stats.totalCertificados = await Certificate.countDocuments();
            stats.totalCPN = await CPN.countDocuments();
            stats.tipo1 = await Certificate.countDocuments({ tipo: 1 });
            
            const cpns = await CPN.find();
            stats.vihPositivo = cpns.filter(c => c.exames.vih.resultado === 'Positivo').length;
            stats.malariaPositivo = cpns.filter(c => c.exames.malaria.resultado === 'Positivo' || c.exames.malaria.resultado === '3000 P/L').length;
        }
        res.json(stats);
    } catch (err) { res.status(500).json({ erro: 'Erro interno' }); }
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
    console.log('🤰 Pré-Natal: INCLUÍDO com genótipo');
    console.log('='.repeat(50) + '\n');
});