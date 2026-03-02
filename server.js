// ============================================
// SNS - SISTEMA NACIONAL DE SAÚDE
// MINISTÉRIO DA SAÚDE - ANGOLA
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

function gerarDadosGenlove(paciente, dados) {
    const partes = paciente.nomeCompleto.split(' ');
    const prenom = partes[0] || '';
    const nom = partes.slice(1).join(' ') || '';
    const genre = paciente.genero || '';
    const genotype = dados.genotipo || '';
    const groupe = dados.grupoSanguineo || '';
    return prenom + '|' + nom + '|' + genre + '|' + genotype + '|' + groupe;
}

// Função para validar NIF angolano (10 dígitos)
function validarNIF(nif) {
    return /^\d{10}$/.test(nif);
}

// Função para enviar email (mock)
async function enviarEmail(destinatario, assunto, mensagem) {
    console.log(`📧 Email enviado para ${destinatario}: ${assunto}`);
    // Implementar envio real com nodemailer se necessário
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

// LABORATÓRIO COM NIF E SISTEMA DE DETECÇÃO
const labSchema = new mongoose.Schema({
    labId: { type: String, unique: true },
    nome: { type: String, required: true },
    nif: { type: String, required: true, unique: true }, // NIF obrigatório e único
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
    
    // SISTEMA DE DETECÇÃO DE PARTILHA DE CHAVES
    dispositivos: [{
        ip: String,
        userAgent: String,
        primeiroAcesso: Date,
        ultimoAcesso: Date,
        totalEmissoesNesteDispositivo: { type: Number, default: 0 }
    }],
    
    padraoEmissao: {
        horarioMaisComum: String,
        diasDaSemana: [Number],
        mediaPorHora: Number,
        desvioPadrao: Number
    },
    
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

const User = mongoose.model('User', userSchema);
const Lab = mongoose.model('Lab', labSchema);
const Certificate = mongoose.model('Certificate', certificateSchema);

// ============================================
// MIDDLEWARES
// ============================================

// Middleware para identificar tipo de acesso
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

// Middleware para detecção de partilha de chaves
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

            // Verificar se este dispositivo já é conhecido
            const dispositivoExistente = lab.dispositivos.find(
                d => d.ip === ip && d.userAgent === userAgent
            );

            if (!dispositivoExistente) {
                // Novo dispositivo detectado
                lab.dispositivos.push({
                    ip,
                    userAgent,
                    primeiroAcesso: agora,
                    ultimoAcesso: agora,
                    totalEmissoesNesteDispositivo: 1
                });

                // ALERTA: Múltiplos dispositivos (partilha de chave)
                if (lab.dispositivos.length >= 3) {
                    lab.alertas.push({
                        tipo: 'MULTIPLOS_IPS',
                        descricao: `Chave utilizada em ${lab.dispositivos.length} dispositivos diferentes. Possível partilha de chave.`
                    });
                    
                    // Enviar email para o ministério
                    enviarEmail('ministerio@saude.gov.ao', '🚨 Alerta de Segurança - Partilha de Chave',
                        `Laboratório ${lab.nome} (NIF: ${lab.nif}) está a usar a chave em ${lab.dispositivos.length} dispositivos.`);
                }
            } else {
                // Atualizar dispositivo existente
                dispositivoExistente.ultimoAcesso = agora;
                dispositivoExistente.totalEmissoesNesteDispositivo++;
            }

            // ALERTA: Horário atípico
            const horarioNormal = (dia >= 1 && dia <= 5 && hora >= 8 && hora <= 18);
            if (!horarioNormal) {
                lab.alertas.push({
                    tipo: 'HORARIO_ATIPICO',
                    descricao: `Emissão em horário atípico: ${hora}h, dia ${dia === 0 ? 'domingo' : 'sábado'}`
                });
            }

            lab.ultimoAcesso = agora;
            await lab.save();
        }
    }
    next();
};

// Middleware para laboratório (emissão)
const labMiddleware = async (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) return res.status(401).json({ erro: 'API Key não fornecida' });
    
    const lab = await Lab.findOne({ apiKey, ativo: true });
    if (!lab) return res.status(401).json({ erro: 'API Key inválida' });
    
    req.lab = lab;
    next();
};

// Middleware para ministério
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
// DASHBOARD
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
    '.modal-content{background:white;padding:30px;border-radius:10px;width:400px;max-height:80vh;overflow-y:auto;}' +
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
    '<a href="#" onclick="mostrarSecao(\'certificados\')">📋 Certificados</a>' +
    '<a href="#" onclick="mostrarSecao(\'alertas\')" id="menuAlertas" style="display:none;">🚨 Alertas</a>' +
    '<button onclick="logout()" style="margin-top:20px;background:#dc3545;width:100%;">Sair</button>' +
    '</div>' +
    '<div class="main">' +

    // BANNER DE BOAS-VINDAS PARA LABORATÓRIO
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
    '<div class="stat-card"><h3>Hoje</h3><div class="value" id="certsHoje">0</div></div>' +
    '</div>' +
    '<div class="stats" style="grid-template-columns:repeat(5,1fr);">' +
    '<div class="stat-card"><h3>🧬 Genótipo</h3><div class="value" id="tipo1">0</div></div>' +
    '<div class="stat-card"><h3>🩺 Boa Saúde</h3><div class="value" id="tipo2">0</div></div>' +
    '<div class="stat-card"><h3>📋 Incapacidade</h3><div class="value" id="tipo3">0</div></div>' +
    '<div class="stat-card"><h3>💪 Aptidão</h3><div class="value" id="tipo4">0</div></div>' +
    '<div class="stat-card"><h3>🤰 Materno</h3><div class="value" id="tipo5">0</div></div>' +
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

    '<div id="secaoAlertas" style="display:none;">' +
    '<h1>🚨 Alertas de Segurança</h1>' +
    '<div id="alertasList"></div>' +
    '</div>' +
    '</div>' +

    // MODAL LABORATÓRIO (COM NIF)
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

    // MODAIS DE CERTIFICADOS
    '<div id="modalCertificado1" class="modal">' +
    '<div class="modal-content">' +
    '<p style="color:#006633;font-size:14px;margin-bottom:15px;" id="labInfoEmitir"></p>' +
    '<h2>🧬 Genótipo</h2>' +
    '<input type="text" id="certNome" placeholder="Nome completo">' +
    '<select id="certGenero"><option value="M">Masculino</option><option value="F">Feminino</option></select>' +
    '<input type="date" id="certDataNasc" placeholder="Data nascimento">' +
    '<input type="text" id="certBI" placeholder="BI">' +
    '<select id="certGenotipo"><option value="AA">AA</option><option value="AS">AS</option><option value="SS">SS</option></select>' +
    '<select id="certGrupo"><option value="A+">A+</option><option value="A-">A-</option><option value="B+">B+</option><option value="B-">B-</option><option value="AB+">AB+</option><option value="AB-">AB-</option><option value="O+">O+</option><option value="O-">O-</option></select>' +
    '<button onclick="emitirCertificado(1)" style="background:#006633;color:white;padding:10px;width:100%;">Emitir</button>' +
    '<button onclick="fecharModal(\'modalCertificado1\')">Cancelar</button>' +
    '</div></div>' +

    '<div id="modalCertificado2" class="modal">' +
    '<div class="modal-content">' +
    '<p style="color:#006633;font-size:14px;margin-bottom:15px;" id="labInfoEmitir2"></p>' +
    '<h2>🩺 Boa Saúde</h2>' +
    '<input type="text" id="cert2Nome" placeholder="Nome completo">' +
    '<select id="cert2Genero"><option value="M">Masculino</option><option value="F">Feminino</option></select>' +
    '<input type="date" id="cert2DataNasc" placeholder="Data nascimento">' +
    '<input type="text" id="cert2BI" placeholder="BI">' +
    '<select id="cert2Avaliacao"><option value="APTO">APTO</option><option value="INAPTO">INAPTO</option></select>' +
    '<input type="text" id="cert2Finalidade" placeholder="Finalidade">' +
    '<button onclick="emitirCertificado(2)" style="background:#006633;color:white;padding:10px;width:100%;">Emitir</button>' +
    '<button onclick="fecharModal(\'modalCertificado2\')">Cancelar</button>' +
    '</div></div>' +

    '<div id="modalCertificado3" class="modal">' +
    '<div class="modal-content">' +
    '<p style="color:#006633;font-size:14px;margin-bottom:15px;" id="labInfoEmitir3"></p>' +
    '<h2>📋 Incapacidade</h2>' +
    '<input type="text" id="cert3Nome" placeholder="Nome completo">' +
    '<select id="cert3Genero"><option value="M">Masculino</option><option value="F">Feminino</option></select>' +
    '<input type="date" id="cert3DataNasc" placeholder="Data nascimento">' +
    '<input type="text" id="cert3BI" placeholder="BI">' +
    '<input type="date" id="cert3Inicio" placeholder="Data início">' +
    '<input type="date" id="cert3Fim" placeholder="Data fim">' +
    '<input type="text" id="cert3Recomendacoes" placeholder="Recomendações">' +
    '<button onclick="emitirCertificado(3)" style="background:#006633;color:white;padding:10px;width:100%;">Emitir</button>' +
    '<button onclick="fecharModal(\'modalCertificado3\')">Cancelar</button>' +
    '</div></div>' +

    '<div id="modalCertificado4" class="modal">' +
    '<div class="modal-content">' +
    '<p style="color:#006633;font-size:14px;margin-bottom:15px;" id="labInfoEmitir4"></p>' +
    '<h2>💪 Aptidão</h2>' +
    '<input type="text" id="cert4Nome" placeholder="Nome completo">' +
    '<select id="cert4Genero"><option value="M">Masculino</option><option value="F">Feminino</option></select>' +
    '<input type="date" id="cert4DataNasc" placeholder="Data nascimento">' +
    '<input type="text" id="cert4BI" placeholder="BI">' +
    '<select id="cert4Tipo"><option value="Profissional">Profissional</option><option value="Desportiva">Desportiva</option><option value="Escolar">Escolar</option></select>' +
    '<input type="text" id="cert4Restricoes" placeholder="Restrições">' +
    '<button onclick="emitirCertificado(4)" style="background:#006633;color:white;padding:10px;width:100%;">Emitir</button>' +
    '<button onclick="fecharModal(\'modalCertificado4\')">Cancelar</button>' +
    '</div></div>' +

    '<div id="modalCertificado5" class="modal">' +
    '<div class="modal-content">' +
    '<p style="color:#006633;font-size:14px;margin-bottom:15px;" id="labInfoEmitir5"></p>' +
    '<h2>🤰 Saúde Materna</h2>' +
    '<input type="text" id="cert5Nome" placeholder="Nome completo">' +
    '<input type="date" id="cert5DataNasc" placeholder="Data nascimento">' +
    '<input type="text" id="cert5BI" placeholder="BI">' +
    '<input type="number" id="cert5Gestacoes" placeholder="Nº gestações">' +
    '<input type="number" id="cert5Partos" placeholder="Nº partos">' +
    '<input type="date" id="cert5DPP" placeholder="Data provável parto">' +
    '<input type="number" id="cert5IG" placeholder="Idade gestacional">' +
    '<button onclick="emitirCertificado(5)" style="background:#006633;color:white;padding:10px;width:100%;">Emitir</button>' +
    '<button onclick="fecharModal(\'modalCertificado5\')">Cancelar</button>' +
    '</div></div>' +

    '<script>' +
    'const token=localStorage.getItem("token");' +
    'const labKey=localStorage.getItem("labKey");' +
    'let acesso="";' +
    'let labId=null;' +
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
    'document.getElementById("secaoAlertas").style.display="none";' +
    'if(s==="dashboard"){document.getElementById("secaoDashboard").style.display="block";carregarStats();}' +
    'if(s==="labs"){document.getElementById("secaoLabs").style.display="block";carregarLabs();}' +
    'if(s==="certificados"){document.getElementById("secaoCertificados").style.display="block";carregarCertificados();}' +
    'if(s==="alertas"){document.getElementById("secaoAlertas").style.display="block";carregarAlertas();}}' +

    'function mostrarModalLab(){document.getElementById("modalLab").style.display="flex";}' +
    'function mostrarModalCertificado(){' +
    'const tipo=document.getElementById("tipoCertificado").value;' +
    'fecharTodosModais();' +
    'document.getElementById("modalCertificado"+tipo).style.display="flex";' +
    'if(acesso==="laboratorio" && labInfo){' +
    'for(let i=1;i<=5;i++){' +
    'if(document.getElementById("labInfoEmitir"+ (i===1?"":i)))' +
    'document.getElementById("labInfoEmitir"+ (i===1?"":i)).innerHTML="🔬 Emitindo como: " + labInfo.nome;' +
    '}}}' +

    'function fecharModal(id){document.getElementById(id).style.display="none";}' +
    'function fecharTodosModais(){' +
    'for(let i=1;i<=5;i++)document.getElementById("modalCertificado"+i).style.display="none";' +
    'document.getElementById("modalLab").style.display="none";}' +

    'function fecharWelcome(){document.getElementById("welcomeBanner").style.display="none";}' +

    // LABORATÓRIOS
    'async function criarLaboratorio(){' +
    'const nif=document.getElementById("labNIF").value;' +
    'if(!/^\\d{10}$/.test(nif)){' +
    'document.getElementById("labNIFError").style.display="block";' +
    'return;}' +
    'const lab={nome:document.getElementById("labNome").value,nif, tipo:document.getElementById("labTipo").value,provincia:document.getElementById("labProvincia").value,municipio:document.getElementById("labMunicipio").value,email:document.getElementById("labEmail").value};' +
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
    'mostrarWelcomeLab(labs[0]);' +
    '}' +
    'labs.forEach(l=>{html+="<tr><td>"+(l.labId||"-")+"</td><td>"+l.nome+"</td><td>"+l.nif+"</td><td>"+l.tipo+"</td><td>"+l.provincia+"</td><td>"+(l.ativo?"✅ Ativo":"❌ Inativo")+' +
    '"</td><td>"+(acesso==="ministerio"?\'<button onclick="verAlertasLab(\\""+l._id+"\\")">🚨</button> <button onclick="desativarLab(\\""+l._id+"\\")">Desativar</button>\':"🔬 Meu Lab")+"</td></tr>";});' +
    'document.getElementById("labsBody").innerHTML=html;' +
    '}' +

    'function mostrarWelcomeLab(lab){' +
    'document.getElementById("welcomeBanner").style.display="block";' +
    'document.getElementById("welcomeLabName").innerHTML="🔬 " + lab.nome;' +
    'document.getElementById("welcomeLabProvincia").innerHTML=lab.provincia;' +
    'document.getElementById("welcomeLabTipo").innerHTML=lab.tipo;' +
    'document.getElementById("welcomeLabNIF").innerHTML=lab.nif;' +
    'document.getElementById("welcomeLabKey").innerHTML=lab.apiKey ? lab.apiKey.substring(0,15)+"..." : "N/A";' +
    'document.getElementById("welcomeLabLastAccess").innerHTML=lab.ultimoAcesso?new Date(lab.ultimoAcesso).toLocaleString():"Primeiro acesso";' +
    'fetch("/api/stats",{headers:{"x-api-key":labKey}}).then(r=>r.json()).then(stats=>{' +
    'document.getElementById("welcomeLabStats").innerHTML=stats.totalCertificados+" certificados emitidos";' +
    '}).catch(()=>{document.getElementById("welcomeLabStats").innerHTML="0 certificados";});}' +

    'async function desativarLab(id){' +
    'if(!confirm("Tem certeza?"))return;' +
    'const r=await fetch("/api/labs/"+id,{method:"DELETE",headers:{"Authorization":"Bearer "+token}});' +
    'if(r.ok){alert("Laboratório desativado");carregarLabs();}}' +

    // ALERTAS
    'async function carregarAlertas(){' +
    'const r=await fetch("/api/alertas",{headers:{"Authorization":"Bearer "+token}});' +
    'const alertas=await r.json();' +
    'let html="";' +
    'if(alertas.length===0) html="<p>✅ Nenhum alerta no momento</p>";' +
    'else alertas.forEach(a=>{' +
    'html+="<div class=\'alerta-card\'><strong>"+a.tipo+"</strong> - "+a.laboratorio+"<br>"+a.descricao+"<br><small>"+new Date(a.data).toLocaleString()+"</small></div>";});' +
    'document.getElementById("alertasList").innerHTML=html;}' +

    'function verAlertasLab(id){' +
    'alert("🚨 Funcionalidade em desenvolvimento");}' +

    // CERTIFICADOS
    'async function emitirCertificado(tipo){' +
    'let dados={};' +
    'let paciente={};' +
    'if(tipo===1){' +
    'paciente={nomeCompleto:document.getElementById("certNome").value,genero:document.getElementById("certGenero").value,dataNascimento:document.getElementById("certDataNasc").value,bi:document.getElementById("certBI").value};' +
    'dados={genotipo:document.getElementById("certGenotipo").value,grupoSanguineo:document.getElementById("certGrupo").value};}' +
    'else if(tipo===2){' +
    'paciente={nomeCompleto:document.getElementById("cert2Nome").value,genero:document.getElementById("cert2Genero").value,dataNascimento:document.getElementById("cert2DataNasc").value,bi:document.getElementById("cert2BI").value};' +
    'dados={avaliacao:document.getElementById("cert2Avaliacao").value,finalidade:[document.getElementById("cert2Finalidade").value]};}' +
    'else if(tipo===3){' +
    'paciente={nomeCompleto:document.getElementById("cert3Nome").value,genero:document.getElementById("cert3Genero").value,dataNascimento:document.getElementById("cert3DataNasc").value,bi:document.getElementById("cert3BI").value};' +
    'dados={periodoInicio:document.getElementById("cert3Inicio").value,periodoFim:document.getElementById("cert3Fim").value,recomendacoes:[document.getElementById("cert3Recomendacoes").value]};}' +
    'else if(tipo===4){' +
    'paciente={nomeCompleto:document.getElementById("cert4Nome").value,genero:document.getElementById("cert4Genero").value,dataNascimento:document.getElementById("cert4DataNasc").value,bi:document.getElementById("cert4BI").value};' +
    'dados={tipoAptidao:document.getElementById("cert4Tipo").value,restricoes:[document.getElementById("cert4Restricoes").value]};}' +
    'else if(tipo===5){' +
    'paciente={nomeCompleto:document.getElementById("cert5Nome").value,dataNascimento:document.getElementById("cert5DataNasc").value,bi:document.getElementById("cert5BI").value};' +
    'dados={obstetricos:{gestacoes:document.getElementById("cert5Gestacoes").value,partos:document.getElementById("cert5Partos").value},dpp:document.getElementById("cert5DPP").value,ig:document.getElementById("cert5IG").value};}' +

    'const r=await fetch("/api/certificados/emitir/"+tipo,{' +
    'method:"POST",' +
    'headers:{"Content-Type":"application/json","x-api-key":labKey},' +
    'body:JSON.stringify({paciente,dados})});' +
    'const data=await r.json();' +
    'if(data.success){' +
    'alert("✅ Certificado emitido!\\nNúmero: "+data.certificado.numero+"\\nGenlove: "+data.certificado.dadosGenlove);' +
    'fecharModal("modalCertificado"+tipo);' +
    'carregarCertificados();' +
    '} else alert("Erro: "+data.erro);' +
    '}' +

    'async function carregarCertificados(){' +
    'let headers={"Content-Type":"application/json"};' +
    'if(acesso==="laboratorio") headers["x-api-key"]=labKey;' +
    'else headers["Authorization"]="Bearer "+token;' +
    'const r=await fetch("/api/certificados",{headers});' +
    'const certs=await r.json();' +
    'let html="";' +
    'const tipos=["","🧬 Genótipo","🩺 Boa Saúde","📋 Incapacidade","💪 Aptidão","🤰 Materno"];' +
    'certs.forEach(c=>{' +
    'const valido=c.validoAte?new Date()<new Date(c.validoAte):true;' +
    'html+="<tr><td>"+c.numero+"</td><td><span class=\'tipo-badge tipo"+c.tipo+"\'>"+tipos[c.tipo]+"</span></td><td>"+c.paciente.nomeCompleto+"</td><td>"+new Date(c.emitidoEm).toLocaleDateString()+"</td><td>"+(c.validoAte?new Date(c.validoAte).toLocaleDateString():"Vitalício")+"</td><td>"+(valido?"✅ Válido":"❌ Expirado")+"</td><td><button onclick=\'downloadPDF(\\""+c.numero+"\\")\' style=\'background:#006633;color:white;border:none;padding:5px 10px;border-radius:3px;cursor:pointer;\'>📥 PDF</button></td></tr>";});' +
    'document.getElementById("certificadosBody").innerHTML=html;}' +

    'function downloadPDF(numero){' +
    'window.open("/api/certificados/"+numero+"/pdf", "_blank");' +
    '}' +

    // ESTATÍSTICAS
    'async function carregarStats(){' +
    'let headers={"Content-Type":"application/json"};' +
    'if(acesso==="laboratorio") headers["x-api-key"]=labKey;' +
    'else headers["Authorization"]="Bearer "+token;' +
    'const r=await fetch("/api/stats",{headers});' +
    'const d=await r.json();' +
    'document.getElementById("totalLabs").innerText=d.totalLabs||0;' +
    'document.getElementById("totalCerts").innerText=d.totalCertificados||0;' +
    'document.getElementById("certsHoje").innerText=d.certificadosHoje||0;' +
    'if(d.certificadosPorTipo){' +
    'document.getElementById("tipo1").innerText=d.certificadosPorTipo.tipo1||0;' +
    'document.getElementById("tipo2").innerText=d.certificadosPorTipo.tipo2||0;' +
    'document.getElementById("tipo3").innerText=d.certificadosPorTipo.tipo3||0;' +
    'document.getElementById("tipo4").innerText=d.certificadosPorTipo.tipo4||0;' +
    'document.getElementById("tipo5").innerText=d.certificadosPorTipo.tipo5||0;}}' +

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
            user = await User.create({
                nome: 'Administrador',
                email,
                password: senhaHash,
                role: 'admin'
            });
        }
        
        const token = jwt.sign(
            { id: user._id, email, role: user.role },
            process.env.JWT_SECRET || 'secret-key',
            { expiresIn: '8h' }
        );
        
        res.json({ token, user: { nome: user.nome, email, role: user.role } });
    } else {
        res.status(401).json({ erro: 'Email ou senha incorretos' });
    }
});

// ============================================
// API DE LABORATÓRIOS
// ============================================

// Criar laboratório (só ministério)
app.post('/api/labs', authMiddleware, async (req, res) => {
    try {
        const dados = req.body;
        
        // Validar NIF
        if (!dados.nif || !validarNIF(dados.nif)) {
            return res.status(400).json({ erro: 'NIF inválido. Deve ter 10 dígitos.' });
        }
        
        const labId = 'LAB-' + Date.now();
        const apiKey = gerarApiKey();
        
        const lab = new Lab({ ...dados, labId, apiKey });
        await lab.save();
        
        res.json({ success: true, lab: { labId: lab.labId, nome: lab.nome, nif: lab.nif, apiKey: lab.apiKey } });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ erro: 'NIF já cadastrado para outro laboratório' });
        }
        res.status(500).json({ erro: 'Erro ao criar laboratório' });
    }
});

// Listar laboratórios
app.get('/api/labs', identificarAcesso, async (req, res) => {
    try {
        if (req.acesso === 'laboratorio') {
            const lab = await Lab.findById(req.lab._id, { apiKey: 0 });
            return res.json([lab]);
        }
        
        const labs = await Lab.find({}, { apiKey: 0 });
        res.json(labs);
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao buscar laboratórios' });
    }
});

// Desativar laboratório
app.delete('/api/labs/:id', authMiddleware, async (req, res) => {
    try {
        await Lab.findByIdAndUpdate(req.params.id, { ativo: false });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ erro: 'Erro interno' });
    }
});

// Bloquear laboratório por suspeita
app.post('/api/labs/:id/bloquear', authMiddleware, async (req, res) => {
    try {
        const lab = await Lab.findById(req.params.id);
        lab.ativo = false;
        await lab.save();
        
        enviarEmail(lab.email, '🔐 Clé API bloquée', 
            `Votre clé API a été bloquée suite à une activité suspecte. Contactez le ministère.`);
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ erro: 'Erro interno' });
    }
});

// ============================================
// API DE CERTIFICADOS (COM DETECÇÃO DE PARTILHA)
// ============================================

// Emitir certificado (com middleware de detecção)
app.post('/api/certificados/emitir/:tipo', labMiddleware, deteccaoPartilhaMiddleware, async (req, res) => {
    try {
        const tipo = parseInt(req.params.tipo);
        const dados = req.body;
        
        const numero = gerarNumeroCertificado(tipo);
        const partes = dados.paciente.nomeCompleto.split(' ');
        const prenome = partes[0];
        const sobrenome = partes.slice(1).join(' ');
        const dadosGenlove = gerarDadosGenlove(dados.paciente, dados.dados);
        
        let validoAte = null;
        const hoje = new Date();
        if (tipo === 2) validoAte = new Date(hoje.setMonth(hoje.getMonth() + 6));
        else if (tipo === 3) validoAte = dados.dados.periodoFim ? new Date(dados.dados.periodoFim) : null;
        else if (tipo === 4) validoAte = new Date(hoje.setFullYear(hoje.getFullYear() + 1));
        else if (tipo === 5) validoAte = dados.dados.dpp ? new Date(dados.dados.dpp) : null;
        
        const hash = crypto.createHash('sha256').update(numero + JSON.stringify(dados) + Date.now()).digest('hex');
        
        const certificado = new Certificate({
            numero,
            tipo,
            paciente: { ...dados.paciente, prenome, sobrenome },
            dados: dados.dados,
            dadosGenlove,
            hash,
            emitidoPor: req.lab._id,
            validoAte
        });
        
        await certificado.save();
        
        req.lab.totalEmissoes = (req.lab.totalEmissoes || 0) + 1;
        req.lab.ultimoAcesso = new Date();
        await req.lab.save();
        
        res.json({
            success: true,
            certificado: {
                numero: certificado.numero,
                tipo: certificado.tipo,
                dadosGenlove,
                hash,
                validoAte
            }
        });
        
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao emitir certificado' });
    }
});

// Listar certificados
app.get('/api/certificados', identificarAcesso, async (req, res) => {
    try {
        let query = {};
        if (req.acesso === 'laboratorio') {
            query.emitidoPor = req.lab._id;
        }
        
        const certs = await Certificate.find(query)
            .sort({ emitidoEm: -1 })
            .limit(50)
            .populate('emitidoPor', 'nome');
        
        res.json(certs);
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao buscar certificados' });
    }
});

// Buscar certificado por número
app.get('/api/certificados/:numero', async (req, res) => {
    try {
        const cert = await Certificate.findOne({ numero: req.params.numero }).populate('emitidoPor', 'nome');
        if (!cert) return res.status(404).json({ erro: 'Certificado não encontrado' });
        res.json(cert);
    } catch (error) {
        res.status(500).json({ erro: 'Erro interno' });
    }
});

// Gerar PDF com QR code real
app.get('/api/certificados/:numero/pdf', async (req, res) => {
    try {
        const certificado = await Certificate.findOne({ numero: req.params.numero })
            .populate('emitidoPor', 'nome');
        
        if (!certificado) {
            return res.status(404).json({ erro: 'Certificado não encontrado' });
        }

        const qrCodeDataUrl = await QRCode.toDataURL(certificado.hash, {
            errorCorrectionLevel: 'H',
            margin: 1,
            width: 200,
            color: {
                dark: '#006633',
                light: '#ffffff'
            }
        });

        const qrCodeBase64 = qrCodeDataUrl.split(',')[1];

        const doc = new PDFDocument({
            size: 'A4',
            margins: { top: 50, bottom: 50, left: 50, right: 50 }
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=certificado-' + certificado.numero + '.pdf');
        
        doc.pipe(res);

        doc.fontSize(20)
           .fillColor('#006633')
           .text('REPÚBLICA DE ANGOLA', { align: 'center' })
           .fontSize(16)
           .text('MINISTÉRIO DA SAÚDE', { align: 'center' })
           .fontSize(24)
           .text('CERTIFICADO MÉDICO OFICIAL', { align: 'center' })
           .moveDown(2);

        doc.fontSize(12)
           .fillColor('black')
           .text('Nº: ' + certificado.numero, { align: 'right' })
           .moveDown();

        doc.strokeColor('#006633')
           .lineWidth(2)
           .moveTo(50, doc.y)
           .lineTo(550, doc.y)
           .stroke()
           .moveDown();

        doc.fontSize(14)
           .fillColor('#006633')
           .text('DADOS DO PACIENTE', { underline: true })
           .fontSize(12)
           .fillColor('black')
           .text('Nome: ' + certificado.paciente.nomeCompleto)
           .text('BI: ' + (certificado.paciente.bi || 'N/A'))
           .text('Data Nascimento: ' + (certificado.paciente.dataNascimento ? new Date(certificado.paciente.dataNascimento).toLocaleDateString('pt-AO') : 'N/A'))
           .moveDown();

        const tipos = ['', 'GENÓTIPO', 'BOA SAÚDE', 'INCAPACIDADE', 'APTIDÃO', 'SAÚDE MATERNA'];
        doc.fontSize(14)
           .fillColor('#006633')
           .text('CERTIFICADO: ' + tipos[certificado.tipo], { underline: true })
           .fontSize(12)
           .fillColor('black');

        if (certificado.tipo === 1) {
            doc.text('Genótipo: ' + (certificado.dados.genotipo || 'N/A'))
               .text('Grupo Sanguíneo: ' + (certificado.dados.grupoSanguineo || 'N/A'));
        } else if (certificado.tipo === 2) {
            doc.text('Avaliação: ' + (certificado.dados.avaliacao || 'N/A'))
               .text('Finalidade: ' + (certificado.dados.finalidade ? certificado.dados.finalidade.join(', ') : 'N/A'));
        } else if (certificado.tipo === 3) {
            doc.text('Período: ' + (certificado.dados.periodoInicio ? new Date(certificado.dados.periodoInicio).toLocaleDateString('pt-AO') : 'N/A') + ' a ' + (certificado.dados.periodoFim ? new Date(certificado.dados.periodoFim).toLocaleDateString('pt-AO') : 'N/A'))
               .text('Dias: ' + (certificado.dados.diasIncapacidade || 'N/A'));
        } else if (certificado.tipo === 4) {
            doc.text('Tipo: ' + (certificado.dados.tipoAptidao || 'N/A'))
               .text('Restrições: ' + (certificado.dados.restricoes ? certificado.dados.restricoes.join(', ') : 'Nenhuma'));
        } else if (certificado.tipo === 5) {
            doc.text('Gestações: ' + (certificado.dados.obstetricos?.gestacoes || '0'))
               .text('Partos: ' + (certificado.dados.obstetricos?.partos || '0'))
               .text('DPP: ' + (certificado.dados.dpp ? new Date(certificado.dados.dpp).toLocaleDateString('pt-AO') : 'N/A'))
               .text('IG: ' + (certificado.dados.ig || 'N/A') + ' semanas');
        }

        doc.moveDown();

        doc.fontSize(14)
           .fillColor('#006633')
           .text('EMITIDO POR', { underline: true })
           .fontSize(12)
           .fillColor('black')
           .text('Laboratório: ' + (certificado.emitidoPor?.nome || 'N/A'))
           .text('Data de Emissão: ' + new Date(certificado.emitidoEm).toLocaleDateString('pt-AO'))
           .text('Validade: ' + (certificado.validoAte ? new Date(certificado.validoAte).toLocaleDateString('pt-AO') : 'Vitalício'))
           .moveDown();

        const yPos = doc.y;
        doc.fontSize(14)
           .fillColor('#006633')
           .text('QR CODE PARA VERIFICAÇÃO', { align: 'center', underline: true })
           .moveDown();

        const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const qrSize = 150;
        const qrX = (pageWidth - qrSize) / 2 + doc.page.margins.left;

        doc.image(Buffer.from(qrCodeBase64, 'base64'), qrX, doc.y, {
            fit: [qrSize, qrSize],
            align: 'center'
        });

        doc.moveDown(8);

        doc.fontSize(8)
           .fillColor('gray')
           .text('Hash: ' + certificado.hash, { align: 'center' })
           .text('Use o aplicativo Genlove ou o portal do ministério para verificar', { align: 'center' })
           .moveDown();

        doc.strokeColor('#006633')
           .lineWidth(1)
           .moveTo(50, 750)
           .lineTo(550, 750)
           .stroke()
           .fontSize(8)
           .fillColor('gray')
           .text('Documento oficial - Ministério da Saúde de Angola', 50, 760, { align: 'center' });

        doc.end();

    } catch (error) {
        console.error('Erro ao gerar PDF:', error);
        res.status(500).json({ erro: 'Erro ao gerar PDF' });
    }
});

// ============================================
// VERIFICAÇÃO PÚBLICA
// ============================================
app.post('/api/verificar', async (req, res) => {
    try {
        const { numero } = req.body;
        const cert = await Certificate.findOne({ numero }).populate('emitidoPor', 'nome');
        
        if (!cert) return res.json({ valido: false, mensagem: 'Certificado não encontrado' });
        
        const valido = cert.validoAte ? new Date() < cert.validoAte : true;
        res.json({
            valido,
            numero: cert.numero,
            tipo: cert.tipo,
            emitidoPor: cert.emitidoPor?.nome,
            emitidoEm: cert.emitidoEm,
            validoAte: cert.validoAte,
            mensagem: valido ? '✅ Certificado válido' : '❌ Certificado expirado'
        });
    } catch (error) {
        res.status(500).json({ erro: 'Erro interno' });
    }
});

// ============================================
// API GENLOVE
// ============================================
app.post('/api/genlove/verificar', async (req, res) => {
    try {
        const { hash } = req.body;
        const apiKey = req.headers['x-api-key'];
        
        if (apiKey !== 'GENLOVE-SECRET-2025') {
            return res.status(401).json({ erro: 'Não autorizado' });
        }
        
        const cert = await Certificate.findOne({ hash });
        if (!cert) return res.json({ valido: false });
        
        const valido = cert.validoAte ? new Date() < cert.validoAte : true;
        res.json({ valido, dados: cert.dadosGenlove, emitidoEm: cert.emitidoEm });
    } catch (error) {
        res.status(500).json({ erro: 'Erro interno' });
    }
});

// ============================================
// ESTATÍSTICAS
// ============================================
app.get('/api/stats', identificarAcesso, async (req, res) => {
    try {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        
        let stats = {};
        
        if (req.acesso === 'laboratorio') {
            stats = {
                totalLabs: 1,
                totalCertificados: await Certificate.countDocuments({ emitidoPor: req.lab._id }),
                certificadosHoje: await Certificate.countDocuments({ 
                    emitidoPor: req.lab._id,
                    emitidoEm: { $gte: hoje } 
                }),
                certificadosPorTipo: {
                    tipo1: await Certificate.countDocuments({ tipo: 1, emitidoPor: req.lab._id }),
                    tipo2: await Certificate.countDocuments({ tipo: 2, emitidoPor: req.lab._id }),
                    tipo3: await Certificate.countDocuments({ tipo: 3, emitidoPor: req.lab._id }),
                    tipo4: await Certificate.countDocuments({ tipo: 4, emitidoPor: req.lab._id }),
                    tipo5: await Certificate.countDocuments({ tipo: 5, emitidoPor: req.lab._id })
                }
            };
        } else {
            stats = {
                totalLabs: await Lab.countDocuments({ ativo: true }),
                totalCertificados: await Certificate.countDocuments(),
                certificadosHoje: await Certificate.countDocuments({ emitidoEm: { $gte: hoje } }),
                certificadosPorTipo: {
                    tipo1: await Certificate.countDocuments({ tipo: 1 }),
                    tipo2: await Certificate.countDocuments({ tipo: 2 }),
                    tipo3: await Certificate.countDocuments({ tipo: 3 }),
                    tipo4: await Certificate.countDocuments({ tipo: 4 }),
                    tipo5: await Certificate.countDocuments({ tipo: 5 })
                }
            };
        }
        
        res.json(stats);
    } catch (err) {
        res.status(500).json({ erro: 'Erro interno' });
    }
});

// ============================================
// API DE ALERTAS
// ============================================
app.get('/api/alertas', authMiddleware, async (req, res) => {
    try {
        const labs = await Lab.find({ "alertas.0": { $exists: true } }, { nome: 1, alertas: 1 });
        
        const alertas = [];
        labs.forEach(lab => {
            lab.alertas.forEach(alerta => {
                if (!alerta.resolvido) {
                    alertas.push({
                        laboratorio: lab.nome,
                        tipo: alerta.tipo,
                        descricao: alerta.descricao,
                        data: alerta.data
                    });
                }
            });
        });
        
        res.json(alertas);
    } catch (error) {
        res.status(500).json({ erro: 'Erro interno' });
    }
});

// ============================================
// TAREFA AUTOMÁTICA DE DETECÇÃO DE ANOMALIAS
// ============================================
async function detectarAnomalias() {
    try {
        const labs = await Lab.find({ ativo: true });
        
        for (const lab of labs) {
            const trintaDias = await Certificate.aggregate([
                { $match: { emitidoPor: lab._id, emitidoEm: { $gte: new Date(Date.now() - 30*24*60*60*1000) } } },
                { $group: { _id: { $dayOfWeek: "$emitidoEm" }, count: { $sum: 1 } } }
            ]);
            
            const total = trintaDias.reduce((acc, d) => acc + d.count, 0);
            const moyenne = total / 30;
            
            const hoje = await Certificate.countDocuments({
                emitidoPor: lab._id,
                emitidoEm: { $gte: new Date().setHours(0,0,0,0) }
            });
            
            if (hoje > moyenne * 3 && moyenne > 5) {
                lab.alertas.push({
                    tipo: 'VOLUME_ANORMAL',
                    descricao: `Volume anormal hoje: ${hoje} emissões (média: ${Math.round(moyenne)})`
                });
                await lab.save();
            }
        }
        console.log('✅ Detecção de anomalias concluída');
    } catch (error) {
        console.error('Erro na detecção de anomalias:', error);
    }
}

// Executar todos os dias à meia-noite
setInterval(detectarAnomalias, 24 * 60 * 60 * 1000);

// ============================================
// INICIAR SERVIDOR
// ============================================
app.listen(PORT, () => {
    console.log('\n' + '='.repeat(50));
    console.log('🚀 SNS - Servidor iniciado');
    console.log('='.repeat(50));
    console.log('📱 URL: http://localhost:' + PORT);
    console.log('🏛️  Ministério: admin@sns.gov.ao / Admin@2025');
    console.log('🔬 Laboratório: Acesse /lab-login com API Key');
    console.log('🔐 Detecção de partilha de chaves: ATIVADA');
    console.log('📊 QR Code real nos PDFs: ATIVADO');
    console.log('='.repeat(50) + '\n');
});