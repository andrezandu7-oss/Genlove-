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
const nodemailer = require('nodemailer');
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
// CONFIGURAÇÃO DE EMAIL
// ============================================
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER || 'sns@sns.gov.ao',
        pass: process.env.EMAIL_PASS || 'senha'
    }
});

// ============================================
// FUNÇÕES AUXILIARES
// ============================================
function gerarApiKey() {
    return 'SNS-' + Date.now() + '-' + crypto.randomBytes(8).toString('hex').toUpperCase();
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

function validarNIF(nif) {
    return /^\d{10}$/.test(nif);
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

// ============================================
// CHAVES DE APPS PARCEIROS (FIXAS NO CÓDIGO)
// ============================================
const GENLOVE_KEYS = [
    'GENLOVE-SNS-KEY-2025-SECRET',
    'GENLOVE-DEV-KEY-2025-TESTE'
];

// ============================================
// FUNÇÃO PARA GERAR PDF DE CREDENCIAIS
// ============================================
async function gerarPDFCredenciais(entidade, tipo, chave) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const buffers = [];
        
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        
        // Cabeçalho
        doc.fontSize(20).fillColor('#006633').text('MINISTÉRIO DA SAÚDE - ANGOLA', { align: 'center' })
           .fontSize(16).text('SISTEMA NACIONAL DE SAÚDE (SNS)', { align: 'center' })
           .moveDown(2)
           .fontSize(18).text('CREDENCIAIS DE ACESSO', { align: 'center' })
           .moveDown(2);

        // Linha separadora
        doc.strokeColor('#006633').lineWidth(2).moveTo(50, doc.y).lineTo(550, doc.y).stroke().moveDown(2);

        // Dados da entidade
        doc.fontSize(14).fillColor('#006633').text('DADOS DA ENTIDADE', { underline: true })
           .fontSize(12).fillColor('black')
           .text('Nome: ' + entidade.nome)
           .text('NIF: ' + entidade.nif)
           .text('Endereço: ' + (entidade.endereco || 'Não informado'))
           .text('Telefone: ' + (entidade.telefone || 'Não informado'))
           .text('Email: ' + entidade.email)
           .text('Responsável: ' + (entidade.responsavel?.nome || entidade.diretor || 'Não informado'))
           .text('Data de Emissão: ' + new Date().toLocaleDateString('pt-AO'))
           .text('Validade: ' + new Date(Date.now() + 365*24*60*60*1000).toLocaleDateString('pt-AO'))
           .moveDown();

        // Chave de acesso em destaque
        doc.fontSize(14).fillColor('#006633').text('CHAVE DE ACESSO', { underline: true })
           .moveDown()
           .fontSize(16).fillColor('#000000')
           .text(chave, { align: 'center', underline: true })
           .moveDown();

        // Aviso de segurança
        doc.fontSize(12).fillColor('#ff0000')
           .text('⚠️ AVISO IMPORTANTE:', { align: 'center' })
           .fontSize(10).fillColor('#666666')
           .text('Esta chave é de uso EXCLUSIVO da entidade acima identificada.', { align: 'center' })
           .text('NÃO COMPARTILHE esta chave com terceiros não autorizados.', { align: 'center' })
           .text('Em caso de perda ou suspeita de uso indevido, contacte imediatamente o Ministério da Saúde.', { align: 'center' })
           .moveDown(2);

        // Rodapé
        doc.fontSize(8).fillColor('#999999')
           .text('Documento gerado eletronicamente em ' + new Date().toLocaleString('pt-AO'), { align: 'center' })
           .text('Ministério da Saúde - República de Angola', { align: 'center' });

        doc.end();
    });
}

// ============================================
// FUNÇÃO PARA ENVIAR EMAIL COM PDF
// ============================================
async function enviarEmailCredenciais(email, nome, tipo, pdfBuffer) {
    const mailOptions = {
        from: '"SNS - Ministério da Saúde" <sns@sns.gov.ao>',
        to: email,
        subject: 'Credenciais de Acesso ao SNS - ' + nome,
        html: `
            <div style="font-family: Arial; padding: 20px;">
                <h2 style="color: #006633;">Ministério da Saúde - Angola</h2>
                <h3>Credenciais de Acesso ao SNS</h3>
                <p>Prezado(a) responsável pelo(a) <strong>${nome}</strong>,</p>
                <p>Sua entidade foi cadastrada no Sistema Nacional de Saúde com sucesso.</p>
                <p>Em anexo, encontra-se o documento oficial com suas credenciais de acesso.</p>
                <p><strong style="color: #ff0000;">⚠️ IMPORTANTE:</strong></p>
                <ul>
                    <li>Esta chave é de uso EXCLUSIVO da sua entidade</li>
                    <li>Não compartilhe por email ou mensagem</li>
                    <li>Guarde o documento em local seguro</li>
                </ul>
                <p>A chave também será entregue fisicamente.</p>
                <hr>
                <p style="color: #666; font-size: 12px;">Ministério da Saúde - República de Angola</p>
            </div>
        `,
        attachments: [{
            filename: 'credenciais-sns-' + nome.toLowerCase().replace(/\s/g, '-') + '.pdf',
            content: pdfBuffer
        }]
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log('✅ Email enviado para ' + email);
        return true;
    } catch (error) {
        console.error('❌ Erro ao enviar email:', error);
        return false;
    }
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
    endereco: String,
    email: { type: String, required: true },
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
            enum: ['MULTIPLOS_IPS', 'HORARIO_ATIPICO', 'VOLUME_ANORMAL']
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
    diretor: { type: String, required: true },
    email: { type: String, required: true },
    telefone: String,
    chaveAcesso: { type: String, unique: true },
    ativo: { type: Boolean, default: true },
    totalConsultas: { type: Number, default: 0 },
    criadoEm: { type: Date, default: Date.now },
    criadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
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
        restricoes: [String]
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

const logSchema = new mongoose.Schema({
    acao: String,
    usuario: String,
    entidade: String,
    detalhes: mongoose.Schema.Types.Mixed,
    ip: String,
    timestamp: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Lab = mongoose.model('Lab', labSchema);
const Hospital = mongoose.model('Hospital', hospitalSchema);
const Empresa = mongoose.model('Empresa', empresaSchema);
const Certificate = mongoose.model('Certificate', certificateSchema);
const CPN = mongoose.model('CPN', cpnSchema);
const Epidemico = mongoose.model('Epidemico', epidemicoSchema);
const Log = mongoose.model('Log', logSchema);

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
    '<button onclick="logout()" style="margin-top:20px;background:#dc3545;width:100%;">Sair</button>' +
    '</div>' +
    '<div class="main">' +

    // Banner de boas-vindas para laboratório
    '<div id="welcomeBanner" style="background:linear-gradient(135deg,#f5f5f5,#ffffff);border-radius:10px;padding:20px;margin-bottom:25px;box-shadow:0 4px 15px rgba(0,102,51,0.1);border-left:5px solid #006633;display:none;">' +
    '<div style="display:flex;align-items:center;gap:15px;">' +
    '<div style="font-size:48px;">🔬</div>' +
    '<div>' +
    '<h3 style="color:#006633;margin-bottom:5px;" id="welcomeLabName"></h3>' +
    '<p style="color:#666;" id="welcomeLabMessage"></p>' +
    '</div>' +
    '</div>' +
    '</div>' +

    '<div id="secaoDashboard">' +
    '<h1>Dashboard</h1>' +
    '<div class="stats">' +
    '<div class="stat-card"><h3>Laboratórios</h3><div class="value" id="totalLabs">0</div></div>' +
    '<div class="stat-card"><h3>Hospitais</h3><div class="value" id="totalHospitais">0</div></div>' +
    '<div class="stat-card"><h3>Empresas</h3><div class="value" id="totalEmpresas">0</div></div>' +
    '</div>' +
    '</div>' +

    '<div id="secaoLabs" style="display:none;">' +
    '<h1>Laboratórios</h1>' +
    '<button class="btn-criar ministerio-only" onclick="mostrarModalLab()">+ Novo Laboratório</button>' +
    '<table><thead><tr><th>ID</th><th>Nome</th><th>NIF</th><th>Tipo</th><th>Província</th><th>Status</th><th>Ações</th></tr></thead>' +
    '<tbody id="labsBody"></tbody></table>' +
    '</div>' +

    '<div id="secaoHospitais" style="display:none;">' +
    '<h1>Hospitais</h1>' +
    '<button class="btn-criar ministerio-only" onclick="mostrarModalHospital()">+ Novo Hospital</button>' +
    '<table><thead><tr><th>Nome</th><th>NIF</th><th>Província</th><th>Diretor</th><th>Status</th><th>Ações</th></tr></thead>' +
    '<tbody id="hospitaisBody"></tbody></table>' +
    '</div>' +

    '<div id="secaoEmpresas" style="display:none;">' +
    '<h1>Empresas</h1>' +
    '<button class="btn-criar ministerio-only" onclick="mostrarModalEmpresa()">+ Nova Empresa</button>' +
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
    '</div>' +

    // MODAIS
    '<div id="modalLab" class="modal">' +
    '<div class="modal-content">' +
    '<h2>Novo Laboratório</h2>' +
    '<input type="text" id="labNome" placeholder="Nome do laboratório *">' +
    '<input type="text" id="labNIF" placeholder="NIF (10 dígitos) *" maxlength="10">' +
    '<select id="labTipo"><option value="laboratorio">Laboratório</option><option value="hospital">Hospital</option><option value="clinica">Clínica</option></select>' +
    '<input type="text" id="labProvincia" placeholder="Província *">' +
    '<input type="text" id="labEndereco" placeholder="Endereço">' +
    '<input type="email" id="labEmail" placeholder="Email *">' +
    '<input type="text" id="labTelefone" placeholder="Telefone">' +
    '<input type="text" id="labDiretor" placeholder="Diretor">' +
    '<p id="labNIFError" style="color:red;font-size:12px;display:none;">NIF deve ter 10 dígitos</p>' +
    '<button onclick="criarLaboratorio()" style="background:#006633;color:white;padding:10px;width:100%;">✅ Criar Laboratório</button>' +
    '<button onclick="fecharModal(\'modalLab\')">Cancelar</button>' +
    '</div></div>' +

    '<div id="modalHospital" class="modal">' +
    '<div class="modal-content">' +
    '<h2>Novo Hospital</h2>' +
    '<input type="text" id="hospitalNome" placeholder="Nome do hospital *">' +
    '<input type="text" id="hospitalNIF" placeholder="NIF (10 dígitos) *" maxlength="10">' +
    '<input type="text" id="hospitalProvincia" placeholder="Província *">' +
    '<input type="text" id="hospitalEndereco" placeholder="Endereço">' +
    '<input type="text" id="hospitalDiretor" placeholder="Diretor *">' +
    '<input type="email" id="hospitalEmail" placeholder="Email *">' +
    '<input type="text" id="hospitalTelefone" placeholder="Telefone">' +
    '<p id="hospitalNIFError" style="color:red;font-size:12px;display:none;">NIF deve ter 10 dígitos</p>' +
    '<button onclick="criarHospital()" style="background:#006633;color:white;padding:10px;width:100%;">✅ Criar Hospital</button>' +
    '<button onclick="fecharModal(\'modalHospital\')">Cancelar</button>' +
    '</div></div>' +

    '<div id="modalEmpresa" class="modal">' +
    '<div class="modal-content">' +
    '<h2>Nova Empresa</h2>' +
    '<input type="text" id="empresaNome" placeholder="Nome da empresa *">' +
    '<input type="text" id="empresaNIF" placeholder="NIF (10 dígitos) *" maxlength="10">' +
    '<input type="text" id="empresaEndereco" placeholder="Endereço">' +
    '<input type="email" id="empresaEmail" placeholder="Email *">' +
    '<input type="text" id="empresaTelefone" placeholder="Telefone">' +
    '<h3>Responsável</h3>' +
    '<input type="text" id="respNome" placeholder="Nome do responsável *">' +
    '<input type="text" id="respCargo" placeholder="Cargo">' +
    '<input type="email" id="respEmail" placeholder="Email do responsável">' +
    '<input type="text" id="respTelefone" placeholder="Telefone do responsável">' +
    '<p id="empresaNIFError" style="color:red;font-size:12px;display:none;">NIF deve ter 10 dígitos</p>' +
    '<button onclick="criarEmpresa()" style="background:#006633;color:white;padding:10px;width:100%;">✅ Criar Empresa</button>' +
    '<button onclick="fecharModal(\'modalEmpresa\')">Cancelar</button>' +
    '</div></div>' +

    // Modais de certificados (resumido)
    '<div id="modalCertificado1" class="modal">' +
    '<div class="modal-content">' +
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
    '<h2>🤰 Saúde Materna</h2>' +
    '<input type="text" id="cert5Nome" placeholder="Nome completo">' +
    '<select id="cert5Genero"><option value="M">Masculino</option><option value="F">Feminino</option></select>' +
    '<input type="date" id="cert5DataNasc" placeholder="Data nascimento">' +
    '<input type="text" id="cert5BI" placeholder="BI">' +
    '<input type="number" id="cert5Gestacoes" placeholder="Nº gestações">' +
    '<input type="number" id="cert5Partos" placeholder="Nº partos">' +
    '<input type="date" id="cert5DPP" placeholder="Data provável parto">' +
    '<input type="number" id="cert5IG" placeholder="Idade gestacional">' +
    '<button onclick="emitirCertificado(5)" style="background:#006633;color:white;padding:10px;width:100%;">Emitir</button>' +
    '<button onclick="fecharModal(\'modalCertificado5\')">Cancelar</button>' +
    '</div></div>' +

    '<div id="modalCPN" class="modal">' +
    '<div class="modal-content">' +
    '<h2>🤰 Certificado Pré-Natal</h2>' +
    '<input type="text" id="cpnNome" placeholder="Nome completo">' +
    '<input type="date" id="cpnDataNasc" placeholder="Data nascimento">' +
    '<input type="text" id="cpnBI" placeholder="BI">' +
    '<input type="text" id="cpnTelefone" placeholder="Telefone">' +
    '<input type="number" id="cpnGestacoes" placeholder="Gestações">' +
    '<input type="number" id="cpnPartos" placeholder="Partos">' +
    '<input type="date" id="cpnDPP" placeholder="Data provável parto">' +
    '<select id="cpnGenotipo"><option value="">Genótipo...</option><option value="AA">AA</option><option value="AS">AS</option><option value="SS">SS</option><option value="NAO">Não solicitado</option></select>' +
    '<select id="cpnVIH"><option value="">VIH...</option><option value="Negativo">Negativo</option><option value="Positivo">Positivo</option><option value="NAO">Não solicitado</option></select>' +
    '<select id="cpnMalaria"><option value="">Malária...</option><option value="Negativo">Negativo</option><option value="Positivo">Positivo</option><option value="NAO">Não solicitado</option></select>' +
    '<input type="text" id="cpnMedico" placeholder="Médico responsável">' +
    '<button onclick="emitirCPN()" style="background:#006633;color:white;padding:10px;width:100%;">Emitir CPN</button>' +
    '<button onclick="fecharModal(\'modalCPN\')">Cancelar</button>' +
    '</div></div>' +

    '<div id="modalEpidemico" class="modal">' +
    '<div class="modal-content">' +
    '<h2>🦠 Certificado Epidemiológico</h2>' +
    '<input type="text" id="epiNome" placeholder="Nome completo">' +
    '<input type="date" id="epiDataNasc" placeholder="Data nascimento">' +
    '<input type="text" id="epiBI" placeholder="BI">' +
    '<select id="epiDoenca"><option value="Febre Amarela">Febre Amarela</option><option value="Ebola">Ebola</option><option value="COVID-19">COVID-19</option><option value="Cólera">Cólera</option><option value="Outra">Outra</option></select>' +
    '<input type="date" id="epiDataExame" placeholder="Data do exame">' +
    '<select id="epiMetodo"><option value="PCR">PCR</option><option value="Teste Rápido">Teste Rápido</option><option value="Sorologia">Sorologia</option></select>' +
    '<select id="epiResultado"><option value="Negativo">Negativo</option><option value="Positivo">Positivo</option></select>' +
    '<button onclick="emitirEpidemico()" style="background:#006633;color:white;padding:10px;width:100%;">Emitir</button>' +
    '<button onclick="fecharModal(\'modalEpidemico\')">Cancelar</button>' +
    '</div></div>' +

    '<script>' +
    'const token=localStorage.getItem("token");' +
    'const labKey=localStorage.getItem("labKey");' +
    'let acesso="";' +

    'if(labKey){' +
    '   acesso="laboratorio";' +
    '   document.getElementById("userType").innerText="🔬 Modo Laboratório";' +
    '   document.getElementById("userType").className="user-badge badge-laboratorio";' +
    '   document.getElementById("menuCertificados").style.display="block";' +
    '   document.querySelectorAll(".ministerio-only").forEach(el => el.style.display="none");' +
    '   carregarDadosLaboratorio();' +
    '}' +
    'else if(token){' +
    '   acesso="ministerio";' +
    '   document.getElementById("userType").innerText="🏛️ Modo Ministério";' +
    '   document.getElementById("userType").className="user-badge badge-ministerio";' +
    '   document.getElementById("menuCertificados").style.display="none";' +
    '   document.querySelectorAll(".ministerio-only").forEach(el => el.style.display="block");' +
    '   carregarStats();' +
    '}' +
    'else window.location.href="/";' +

    'function mostrarSecao(s){' +
    '   document.querySelectorAll(".secao").forEach(el => el.style.display="none");' +
    '   document.getElementById("secao"+s).style.display="block";' +
    '}' +

    'function mostrarModalLab(){document.getElementById("modalLab").style.display="flex";}' +
    'function mostrarModalHospital(){document.getElementById("modalHospital").style.display="flex";}' +
    'function mostrarModalEmpresa(){document.getElementById("modalEmpresa").style.display="flex";}' +
    'function mostrarModalCertificado(){document.getElementById("modalCertificado"+document.getElementById("tipoCertificado").value).style.display="flex";}' +
    'function mostrarModalCPN(){document.getElementById("modalCPN").style.display="flex";}' +
    'function mostrarModalEpidemico(){document.getElementById("modalEpidemico").style.display="flex";}' +
    'function fecharModal(id){document.getElementById(id).style.display="none";}' +

    'function mostrarAbaCert(aba){' +
    '   document.getElementById("abaCertGeral").style.display="none";' +
    '   document.getElementById("abaCertCPN").style.display="none";' +
    '   document.getElementById("abaCertEpidemico").style.display="none";' +
    '   document.getElementById("abaCert"+aba).style.display="block";' +
    '}' +

    'async function carregarDadosLaboratorio(){' +
    '   const r=await fetch("/api/labs/me",{headers:{"x-api-key":labKey}});' +
    '   const lab=await r.json();' +
    '   if(lab){' +
    '       document.getElementById("welcomeBanner").style.display="block";' +
    '       document.getElementById("welcomeLabName").innerText=lab.nome;' +
    '       document.getElementById("welcomeLabMessage").innerText="👋 Olá, "+lab.nome+"! 💪 Pronto para mais um dia de trabalho? Vamos juntos!";' +
    '   }' +
    '}' +

    'async function criarLaboratorio(){' +
    '   const nif=document.getElementById("labNIF").value;' +
    '   if(!/^\\d{10}$/.test(nif)){document.getElementById("labNIFError").style.display="block";return;}' +
    '   const dados={nome:document.getElementById("labNome").value,nif,tipo:document.getElementById("labTipo").value,provincia:document.getElementById("labProvincia").value,endereco:document.getElementById("labEndereco").value,email:document.getElementById("labEmail").value,telefone:document.getElementById("labTelefone").value,diretor:document.getElementById("labDiretor").value};' +
    '   const r=await fetch("/api/labs",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},body:JSON.stringify(dados)});' +
    '   const d=await r.json();' +
    '   if(d.success){alert("✅ Laboratório criado!\\n\\n🔑 API Key: "+d.lab.apiKey+"\\n\\n📧 Email enviado para "+dados.email+"\\n\\n📄 PDF gerado. Entregar via física também.");fecharModal("modalLab");carregarLabs();}' +
    '   else alert("Erro: "+d.erro);' +
    '}' +

    'async function criarHospital(){' +
    '   const nif=document.getElementById("hospitalNIF").value;' +
    '   if(!/^\\d{10}$/.test(nif)){document.getElementById("hospitalNIFError").style.display="block";return;}' +
    '   const dados={nome:document.getElementById("hospitalNome").value,nif,provincia:document.getElementById("hospitalProvincia").value,endereco:document.getElementById("hospitalEndereco").value,diretor:document.getElementById("hospitalDiretor").value,email:document.getElementById("hospitalEmail").value,telefone:document.getElementById("hospitalTelefone").value};' +
    '   const r=await fetch("/api/hospitais",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},body:JSON.stringify(dados)});' +
    '   const d=await r.json();' +
    '   if(d.success){alert("✅ Hospital criado!\\n\\n🔑 Chave: "+d.chave+"\\n\\n📧 Email enviado para "+dados.email);fecharModal("modalHospital");carregarHospitais();}' +
    '   else alert("Erro: "+d.erro);' +
    '}' +

    'async function criarEmpresa(){' +
    '   const nif=document.getElementById("empresaNIF").value;' +
    '   if(!/^\\d{10}$/.test(nif)){document.getElementById("empresaNIFError").style.display="block";return;}' +
    '   const dados={nome:document.getElementById("empresaNome").value,nif,endereco:document.getElementById("empresaEndereco").value,email:document.getElementById("empresaEmail").value,telefone:document.getElementById("empresaTelefone").value,responsavel:{nome:document.getElementById("respNome").value,cargo:document.getElementById("respCargo").value,email:document.getElementById("respEmail").value,telefone:document.getElementById("respTelefone").value}};' +
    '   const r=await fetch("/api/empresas",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},body:JSON.stringify(dados)});' +
    '   const d=await r.json();' +
    '   if(d.success){alert("✅ Empresa criada!\\n\\n🔑 Chave: "+d.chave+"\\n\\n📧 Email enviado para "+dados.email);fecharModal("modalEmpresa");carregarEmpresas();}' +
    '   else alert("Erro: "+d.erro);' +
    '}' +

    'function logout(){localStorage.removeItem("token");localStorage.removeItem("labKey");window.location.href="/";}' +
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

        // Gerar PDF
        const pdfBuffer = await gerarPDFCredenciais(lab, 'Laboratório', apiKey);
        
        // Enviar email
        await enviarEmailCredenciais(lab.email, lab.nome, 'Laboratório', pdfBuffer);

        res.json({ 
            success: true, 
            lab: { labId, nome: lab.nome, nif: lab.nif, apiKey },
            mensagem: 'PDF gerado e email enviado com sucesso'
        });
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

        // Gerar PDF
        const pdfBuffer = await gerarPDFCredenciais(hospital, 'Hospital', chaveAcesso);
        
        // Enviar email
        await enviarEmailCredenciais(hospital.email, hospital.nome, 'Hospital', pdfBuffer);

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

        // Gerar PDF
        const pdfBuffer = await gerarPDFCredenciais(empresa, 'Empresa', chaveAcesso);
        
        // Enviar email
        await enviarEmailCredenciais(empresa.email, empresa.nome, 'Empresa', pdfBuffer);

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
// API DE CERTIFICADOS (apenas laboratórios)
// ============================================
app.post('/api/certificados/emitir/:tipo', labMiddleware, async (req, res) => {
    try {
        const tipo = parseInt(req.params.tipo);
        const dados = req.body;
        const numero = gerarNumeroCertificado(tipo);
        const partes = dados.paciente.nomeCompleto.split(' ');
        const prenome = partes[0];
        const sobrenome = partes.slice(1).join(' ');
        
        let dadosGenlove = '';
        if (tipo === 1) {
            dadosGenlove = gerarDadosGenlove(dados.paciente, dados.dados);
        }
        
        const hash = crypto.createHash('sha256').update(numero + JSON.stringify(dados) + Date.now()).digest('hex');
        
        const certificado = new Certificate({
            numero,
            tipo,
            paciente: { ...dados.paciente, prenome, sobrenome },
            dados: dados.dados,
            dadosGenlove,
            hash,
            emitidoPor: req.lab._id
        });
        
        await certificado.save();
        
        req.lab.totalEmissoes++;
        await req.lab.save();
        
        res.json({ success: true, numero, hash, dadosGenlove });
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao emitir certificado' });
    }
});

app.post('/api/cpn/emitir', labMiddleware, async (req, res) => {
    try {
        const dados = req.body;
        const numero = gerarNumeroCPN();
        const hash = crypto.createHash('sha256').update(numero + JSON.stringify(dados) + Date.now()).digest('hex');
        
        const cpn = new CPN({ ...dados, numero, hash, emitidoPor: req.lab._id });
        await cpn.save();
        
        res.json({ success: true, numero });
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao emitir CPN' });
    }
});

app.post('/api/epidemico/emitir', labMiddleware, async (req, res) => {
    try {
        const dados = req.body;
        const numero = gerarNumeroEpidemico();
        const hash = crypto.createHash('sha256').update(numero + JSON.stringify(dados) + Date.now()).digest('hex');
        
        const epidemico = new Epidemico({ ...dados, numero, hash, emitidoPor: req.lab._id });
        await epidemico.save();
        
        res.json({ success: true, numero });
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao emitir certificado epidemiológico' });
    }
});

// ============================================
// API DE LEITURA (para apps futuros)
// ============================================
app.post('/api/ler', async (req, res) => {
    const { chave, hash, tipoAcesso } = req.body;
    
    // Validar chave conforme tipo de acesso
    let entidade = null;
    if (tipoAcesso === 'hospital') {
        entidade = await Hospital.findOne({ chaveAcesso: chave, ativo: true });
    } else if (tipoAcesso === 'empresa') {
        entidade = await Empresa.findOne({ chaveAcesso: chave, ativo: true });
    }
    
    if (!entidade) {
        return res.status(401).json({ erro: 'Chave inválida' });
    }
    
    // Buscar certificado
    let certificado = await Certificate.findOne({ hash });
    if (!certificado) certificado = await CPN.findOne({ hash });
    if (!certificado) certificado = await Epidemico.findOne({ hash });
    
    if (!certificado) {
        return res.status(404).json({ erro: 'Certificado não encontrado' });
    }
    
    // Aplicar regras por tipo de acesso
    if (tipoAcesso === 'hospital') {
        return res.json({ sucesso: true, dados: certificado });
    }
    
    if (tipoAcesso === 'empresa') {
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
        }
        if (certificado.tipo === 4) {
            return res.json({
                sucesso: true,
                dados: {
                    nome: certificado.paciente.nomeCompleto,
                    avaliacao: certificado.dados.avaliacao,
                    restricoes: certificado.dados.restricoes
                }
            });
        }
        return res.status(403).json({ erro: 'Não autorizado para este tipo de certificado' });
    }
});

// ============================================
// API GENLOVE
// ============================================
app.post('/api/genlove/verificar', async (req, res) => {
    const apiKey = req.headers['x-api-key'];
    if (!GENLOVE_KEYS.includes(apiKey)) {
        return res.status(401).json({ erro: 'Chave Genlove inválida' });
    }
    
    const { hash } = req.body;
    const certificado = await Certificate.findOne({ hash });
    
    if (!certificado || certificado.tipo !== 1) {
        return res.json({ valido: false });
    }
    
    res.json({
        valido: true,
        dados: certificado.dadosGenlove
    });
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
    } catch (err) {
        res.status(500).json({ erro: 'Erro interno' });
    }
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
    console.log('🏥 Hospitais: Chave por hospital (app)');
    console.log('🏢 Empresas: Chave por empresa (app)');
    console.log('💘 Genlove: Chave fixa no código');
    console.log('📧 PDF e Email: Automáticos');
    console.log('='.repeat(50) + '\n');
});