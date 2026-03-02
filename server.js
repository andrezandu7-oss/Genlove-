// ============================================
// SNS - SISTEMA NACIONAL DE SAÚDE
// MINISTÉRIO DA SAÚDE - ANGOLA
// VERSÃO PROFISSIONAL COM TODOS OS AMENDAMENTOS
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
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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
    const prefixos = {
        1: 'GEN', 2: 'SAU', 3: 'INC', 4: 'APT', 5: 'MAT', 6: 'CPN', 7: 'EPI'
    };
    return prefixos[tipo] + '-' + ano + mes + '-' + random;
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

// 7 TIPOS DE CERTIFICADOS
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
        // Tipo 1: Genótipo
        genotipo: String,
        grupoSanguineo: String,
        
        // Tipo 2: Boa Saúde
        avaliacao: String,
        finalidade: String,
        
        // Tipo 3: Incapacidade
        periodoInicio: Date,
        periodoFim: Date,
        diasIncapacidade: Number,
        cid: String,
        
        // Tipo 4: Aptidão
        tipoAptidao: String,
        restricoes: String,
        
        // Tipo 5: Saúde Materna
        gestacoes: Number,
        partos: Number,
        dpp: Date,
        ig: Number,
        
        // Tipo 6: CPN (Pré-Natal)
        consultas: Number,
        exames: {
            genotipo: String,
            vih: String,
            malaria: String,
            sifilis: String,
            hemoglobina: Number
        },
        
        // Tipo 7: Epidemiológico
        doenca: String,
        dataExame: Date,
        metodo: String,
        resultado: String
    },
    dadosGenlove: String,
    hash: { type: String, unique: true },
    emitidoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Lab' },
    emitidoEm: { type: Date, default: Date.now },
    validoAte: Date
});

const User = mongoose.model('User', userSchema);
const Lab = mongoose.model('Lab', labSchema);
const Hospital = mongoose.model('Hospital', hospitalSchema);
const Empresa = mongoose.model('Empresa', empresaSchema);
const Certificate = mongoose.model('Certificate', certificateSchema);

// ============================================
// FUNÇÕES DE CRIAÇÃO DE PDF
// ============================================

// PDF de Credenciais (formato A4 profissional)
async function gerarPDFCredenciais(entidade, tipo, chave) {
    return new Promise((resolve) => {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => resolve(Buffer.concat(buffers)));

        // Cabeçalho
        doc.fontSize(24).fillColor('#006633').text('REPÚBLICA DE ANGOLA', { align: 'center' })
           .fontSize(18).text('MINISTÉRIO DA SAÚDE', { align: 'center' })
           .fontSize(22).text('SISTEMA NACIONAL DE SAÚDE (SNS)', { align: 'center' })
           .moveDown(2)
           .fontSize(20).text('CREDENCIAIS DE ACESSO', { align: 'center' })
           .moveDown(2);

        // Linha separadora
        doc.strokeColor('#006633').lineWidth(2).moveTo(50, doc.y).lineTo(550, doc.y).stroke().moveDown(2);

        // Dados da entidade
        doc.fontSize(14).fillColor('#006633').text('DADOS DA ENTIDADE', { underline: true })
           .fontSize(12).fillColor('black')
           .text('Tipo: ' + (tipo === 'hospital' ? 'HOSPITAL' : 'EMPRESA'))
           .text('Nome: ' + entidade.nome)
           .text('NIF: ' + entidade.nif)
           .text('Endereço: ' + (entidade.endereco || 'Não informado'))
           .text('Email: ' + entidade.email)
           .text('Telefone: ' + (entidade.telefone || 'Não informado'))
           .text('Responsável: ' + (entidade.diretor || entidade.responsavel?.nome || 'Não informado'))
           .moveDown();

        // Data de emissão e validade
        const hoje = new Date();
        const validade = new Date(hoje.setFullYear(hoje.getFullYear() + 1));
        
        doc.text('Data de Emissão: ' + new Date().toLocaleDateString('pt-AO'))
           .text('Data de Validade: ' + validade.toLocaleDateString('pt-AO'))
           .moveDown();

        // Chave de acesso em destaque
        doc.fontSize(16).fillColor('#006633').text('CHAVE DE ACESSO:', { align: 'center' })
           .fontSize(20).fillColor('#000000').text(chave, { align: 'center', underline: true })
           .moveDown(2);

        // Aviso de segurança
        doc.fontSize(12).fillColor('#FF0000')
           .text('⚠️ AVISO IMPORTANTE:', { align: 'center' })
           .fontSize(10).fillColor('#666666')
           .text('Esta chave é de uso EXCLUSIVO da entidade acima identificada.', { align: 'center' })
           .text('NÃO COMPARTILHE esta chave com terceiros não autorizados.', { align: 'center' })
           .text('Em caso de perda ou uso indevido, contacte imediatamente o Ministério da Saúde.', { align: 'center' })
           .moveDown(2);

        // Rodapé
        doc.fontSize(8).fillColor('#999999')
           .text('Documento gerado eletronicamente em ' + new Date().toLocaleString('pt-AO'), { align: 'center' })
           .text('Ministério da Saúde - República de Angola', { align: 'center' });

        doc.end();
    });
}

// PDF de Certificado Genótipo (tipo 1)
async function gerarPDFGenotipo(cert) {
    return new Promise((resolve) => {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => resolve(Buffer.concat(buffers)));

        doc.fontSize(20).fillColor('#006633').text('REPÚBLICA DE ANGOLA', { align: 'center' })
           .fontSize(16).text('MINISTÉRIO DA SAÚDE', { align: 'center' })
           .fontSize(24).text('CERTIFICADO DE GENÓTIPO', { align: 'center' })
           .moveDown()
           .fontSize(12).text('Nº: ' + cert.numero, { align: 'right' })
           .moveDown()
           .fontSize(14).fillColor('#006633').text('DADOS DO PACIENTE', { underline: true })
           .fontSize(12).fillColor('black')
           .text('Nome: ' + cert.paciente.nomeCompleto)
           .text('BI: ' + cert.paciente.bi)
           .text('Data Nascimento: ' + new Date(cert.paciente.dataNascimento).toLocaleDateString('pt-AO'))
           .moveDown()
           .fontSize(14).fillColor('#006633').text('RESULTADO', { underline: true })
           .fontSize(14).fillColor('black')
           .text('Genótipo: ' + cert.dados.genotipo)
           .text('Grupo Sanguíneo: ' + cert.dados.grupoSanguineo)
           .moveDown(4)
           .fontSize(10).fillColor('#666')
           .text('Data de Emissão: ' + new Date(cert.emitidoEm).toLocaleDateString('pt-AO'), { align: 'right' });

        doc.end();
    });
}

// PDF de Certificado CPN (tipo 6)
async function gerarPDFCPN(cert) {
    return new Promise((resolve) => {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => resolve(Buffer.concat(buffers)));

        doc.fontSize(20).fillColor('#006633').text('REPÚBLICA DE ANGOLA', { align: 'center' })
           .fontSize(16).text('MINISTÉRIO DA SAÚDE', { align: 'center' })
           .fontSize(24).text('CERTIFICADO PRÉ-NATAL (CPN)', { align: 'center' })
           .moveDown()
           .fontSize(12).text('Nº: ' + cert.numero, { align: 'right' })
           .moveDown()
           .fontSize(14).fillColor('#006633').text('DADOS DA GESTANTE', { underline: true })
           .fontSize(12).fillColor('black')
           .text('Nome: ' + cert.paciente.nomeCompleto)
           .text('BI: ' + cert.paciente.bi)
           .text('Data Nascimento: ' + new Date(cert.paciente.dataNascimento).toLocaleDateString('pt-AO'))
           .moveDown()
           .fontSize(14).fillColor('#006633').text('DADOS OBSTÉTRICOS', { underline: true })
           .fontSize(12).fillColor('black')
           .text('Gestações: ' + cert.dados.gestacoes)
           .text('Partos: ' + cert.dados.partos)
           .text('Data Provável do Parto: ' + (cert.dados.dpp ? new Date(cert.dados.dpp).toLocaleDateString('pt-AO') : 'N/A'))
           .text('Idade Gestacional: ' + (cert.dados.ig || 'N/A') + ' semanas')
           .moveDown()
           .fontSize(14).fillColor('#006633').text('EXAMES', { underline: true })
           .fontSize(12).fillColor('black')
           .text('Genótipo: ' + (cert.dados.exames?.genotipo || 'N/A'))
           .text('VIH: ' + (cert.dados.exames?.vih || 'N/A'))
           .text('Malária: ' + (cert.dados.exames?.malaria || 'N/A'))
           .text('Sífilis: ' + (cert.dados.exames?.sifilis || 'N/A'))
           .text('Hemoglobina: ' + (cert.dados.exames?.hemoglobina || 'N/A') + ' g/dL')
           .moveDown(2)
           .fontSize(10).fillColor('#666')
           .text('Data de Emissão: ' + new Date(cert.emitidoEm).toLocaleDateString('pt-AO'), { align: 'right' });

        doc.end();
    });
}

// PDF de Certificado Epidemiológico (tipo 7)
async function gerarPDFEpidemico(cert) {
    return new Promise((resolve) => {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => resolve(Buffer.concat(buffers)));

        doc.fontSize(20).fillColor('#006633').text('REPÚBLICA DE ANGOLA', { align: 'center' })
           .fontSize(16).text('MINISTÉRIO DA SAÚDE', { align: 'center' })
           .fontSize(24).text('CERTIFICADO EPIDEMIOLÓGICO', { align: 'center' })
           .moveDown()
           .fontSize(12).text('Nº: ' + cert.numero, { align: 'right' })
           .moveDown()
           .fontSize(14).fillColor('#006633').text('DADOS DO PACIENTE', { underline: true })
           .fontSize(12).fillColor('black')
           .text('Nome: ' + cert.paciente.nomeCompleto)
           .text('BI: ' + cert.paciente.bi)
           .text('Data Nascimento: ' + new Date(cert.paciente.dataNascimento).toLocaleDateString('pt-AO'))
           .moveDown()
           .fontSize(14).fillColor('#006633').text('RESULTADO DE EXAME', { underline: true })
           .fontSize(12).fillColor('black')
           .text('Doença: ' + cert.dados.doenca)
           .text('Data do Exame: ' + new Date(cert.dados.dataExame).toLocaleDateString('pt-AO'))
           .text('Método: ' + cert.dados.metodo)
           .text('Resultado: ' + cert.dados.resultado)
           .moveDown(2)
           .fontSize(10).fillColor('#666')
           .text('Data de Emissão: ' + new Date(cert.emitidoEm).toLocaleDateString('pt-AO'), { align: 'right' });

        doc.end();
    });
}

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
    if (!lab) return res.status(401).json({ erro: '❌ Chave inválida. Use a chave correta para entrar.' });
    
    req.lab = lab;
    next();
};

// ============================================
// ROTAS PÚBLICAS
// ============================================
app.get('/', (req, res) => {
    res.send('<!DOCTYPE html>' +
    '<html lang="pt">' +
    '<head><meta charset="UTF-8"><title>SNS - Angola</title>' +
    '<style>' +
    '*{margin:0;padding:0;box-sizing:border-box;font-family:Arial;}' +
    'body{background:linear-gradient(135deg,#006633,#003300);min-height:100vh;display:flex;align-items:center;justify-content:center;}' +
    '.container{background:white;padding:40px;border-radius:20px;box-shadow:0 20px 40px rgba(0,0,0,0.3);width:90%;max-width:400px;}' +
    'h1{color:#006633;text-align:center;margin-bottom:30px;}' +
    '.btn{display:block;padding:15px;margin:15px 0;background:#006633;color:white;text-decoration:none;border-radius:10px;text-align:center;font-size:18px;}' +
    '.btn:hover{background:#004d26;}' +
    '.footer{margin-top:30px;text-align:center;color:#666;font-size:12px;}' +
    '</style>' +
    '</head>' +
    '<body>' +
    '<div class="container">' +
    '<h1>SNS - Angola</h1>' +
    '<p style="text-align:center;margin-bottom:30px;">Sistema Nacional de Saúde</p>' +
    '<a href="/ministerio" class="btn">🏛️ Ministério da Saúde</a>' +
    '<a href="/lab-login" class="btn">🔬 Laboratório</a>' +
    '<div class="footer">Ministério da Saúde - República de Angola</div>' +
    '</div>' +
    '</body></html>');
});

// ============================================
// MINISTÉRIO - LOGIN
// ============================================
app.get('/ministerio', (req, res) => {
    res.send('<!DOCTYPE html>' +
    '<html lang="pt">' +
    '<head><meta charset="UTF-8"><title>Ministério - Login</title>' +
    '<style>' +
    '*{margin:0;padding:0;box-sizing:border-box;font-family:Arial;}' +
    'body{background:linear-gradient(135deg,#006633,#003300);min-height:100vh;display:flex;align-items:center;justify-content:center;}' +
    '.container{background:white;padding:40px;border-radius:20px;box-shadow:0 20px 40px rgba(0,0,0,0.3);width:90%;max-width:400px;}' +
    'h1{color:#006633;text-align:center;margin-bottom:30px;}' +
    'h2{color:#333;margin-bottom:20px;text-align:center;}' +
    'input{width:100%;padding:12px;margin:10px 0;border:2px solid #e0e0e0;border-radius:8px;font-size:16px;}' +
    'button{width:100%;padding:14px;background:#006633;color:white;border:none;border-radius:8px;font-size:16px;cursor:pointer;}' +
    'button:hover{background:#004d26;}' +
    '.error{color:red;margin:10px 0;display:none;text-align:center;}' +
    '</style>' +
    '</head>' +
    '<body>' +
    '<div class="container">' +
    '<h1>SNS - Angola</h1>' +
    '<h2>Acesso Ministério</h2>' +
    '<div id="error" class="error"></div>' +
    '<input type="email" id="email" placeholder="Email" value="admin@sns.gov.ao">' +
    '<input type="password" id="password" placeholder="Senha" value="Admin@2025">' +
    '<button onclick="login()">Entrar</button>' +
    '</div>' +
    '<script>' +
    'async function login(){' +
    'const email=document.getElementById("email").value;' +
    'const pass=document.getElementById("password").value;' +
    'const r=await fetch("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,password})});' +
    'const d=await r.json();' +
    'if(d.token){localStorage.setItem("token",d.token);window.location.href="/admin-dashboard";}' +
    'else{document.getElementById("error").style.display="block";document.getElementById("error").innerText=d.erro||"Erro no login";}}' +
    '</script>' +
    '</body></html>');
});

// ============================================
// LABORATÓRIO - LOGIN
// ============================================
app.get('/lab-login', (req, res) => {
    res.send('<!DOCTYPE html>' +
    '<html lang="pt">' +
    '<head><meta charset="UTF-8"><title>Laboratório - Login</title>' +
    '<style>' +
    '*{margin:0;padding:0;box-sizing:border-box;font-family:Arial;}' +
    'body{background:linear-gradient(135deg,#006633,#003300);min-height:100vh;display:flex;align-items:center;justify-content:center;}' +
    '.container{background:white;padding:40px;border-radius:20px;box-shadow:0 20px 40px rgba(0,0,0,0.3);width:90%;max-width:400px;}' +
    'h1{color:#006633;text-align:center;margin-bottom:30px;}' +
    'h2{color:#333;margin-bottom:20px;text-align:center;}' +
    'input{width:100%;padding:12px;margin:10px 0;border:2px solid #e0e0e0;border-radius:8px;font-size:16px;}' +
    'button{width:100%;padding:14px;background:#006633;color:white;border:none;border-radius:8px;font-size:16px;cursor:pointer;}' +
    'button:hover{background:#004d26;}' +
    '.error{color:red;margin:10px 0;display:none;text-align:center;}' +
    '</style>' +
    '</head>' +
    '<body>' +
    '<div class="container">' +
    '<h1>SNS - Angola</h1>' +
    '<h2>Acesso Laboratório</h2>' +
    '<div id="error" class="error"></div>' +
    '<input type="text" id="apiKey" placeholder="Digite sua API Key">' +
    '<button onclick="login()">Entrar</button>' +
    '</div>' +
    '<script>' +
    'async function login(){' +
    'const key=document.getElementById("apiKey").value;' +
    'if(!key){document.getElementById("error").style.display="block";document.getElementById("error").innerText="Digite a API Key";return;}' +
    'const r=await fetch("/api/labs/verificar",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({apiKey:key})});' +
    'const d=await r.json();' +
    'if(d.valido){localStorage.setItem("labKey",key);window.location.href="/lab-dashboard";}' +
    'else{document.getElementById("error").style.display="block";document.getElementById("error").innerText="❌ Chave inválida. Use a chave correta para entrar.";}}' +
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
    } else res.status(401).json({ erro: 'Email ou senha incorretos' });
});

app.post('/api/labs/verificar', async (req, res) => {
    const { apiKey } = req.body;
    const lab = await Lab.findOne({ apiKey, ativo: true });
    res.json({ valido: !!lab });
});

// ============================================
// DASHBOARD DO MINISTÉRIO (PROFISSIONAL)
// ============================================
app.get('/admin-dashboard', (req, res) => {
    res.send('<!DOCTYPE html>' +
    '<html lang="pt">' +
    '<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    '<title>Ministério da Saúde - SNS</title>' +
    '<style>' +
    '*{margin:0;padding:0;box-sizing:border-box;font-family:"Segoe UI",Arial;}' +
    'body{display:flex;background:#f5f5f5;}' +
    '.sidebar{width:280px;background:#006633;color:white;height:100vh;padding:20px;position:fixed;overflow-y:auto;}' +
    '.sidebar h2{margin-bottom:30px;font-size:24px;border-bottom:2px solid #ffcc00;padding-bottom:10px;}' +
    '.sidebar a{display:block;color:white;text-decoration:none;padding:12px;margin:5px 0;border-radius:8px;transition:0.3s;}' +
    '.sidebar a:hover{background:#004d26;padding-left:20px;}' +
    '.main{margin-left:300px;padding:30px;flex:1;}' +
    '.header{background:white;padding:20px;border-radius:10px;margin-bottom:20px;box-shadow:0 2px 10px rgba(0,0,0,0.1);}' +
    '.header h1{color:#006633;}' +
    '.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-bottom:30px;}' +
    '.stat-card{background:white;padding:20px;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.1);}' +
    '.stat-card h3{color:#666;margin-bottom:10px;}' +
    '.stat-card .value{font-size:36px;font-weight:bold;color:#006633;}' +
    '.btn{background:#006633;color:white;border:none;padding:12px 20px;border-radius:8px;cursor:pointer;margin:5px;font-size:14px;}' +
    '.btn:hover{background:#004d26;}' +
    '.btn-danger{background:#dc3545;}' +
    '.btn-danger:hover{background:#c82333;}' +
    '.btn-success{background:#28a745;}' +
    '.btn-success:hover{background:#218838;}' +
    'table{width:100%;background:white;border-radius:10px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,0.1);margin-top:20px;}' +
    'th{background:#006633;color:white;padding:15px;text-align:left;}' +
    'td{padding:12px;border-bottom:1px solid #eee;}' +
    '.modal{display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);align-items:center;justify-content:center;z-index:1000;}' +
    '.modal-content{background:white;padding:30px;border-radius:10px;width:500px;max-width:90%;max-height:80vh;overflow-y:auto;}' +
    '.modal-content h3{color:#006633;margin-bottom:20px;}' +
    '.modal-content input{width:100%;padding:10px;margin:10px 0;border:1px solid #ddd;border-radius:5px;}' +
    '.modal-content button{margin:5px;}' +
    '.error-message{color:#dc3545;font-size:12px;display:none;}' +
    '.success-message{color:#28a745;font-size:12px;display:none;}' +
    '.badge{padding:5px 10px;border-radius:20px;font-size:12px;font-weight:bold;}' +
    '.badge-active{background:#d4edda;color:#155724;}' +
    '.badge-inactive{background:#f8d7da;color:#721c24;}' +
    '</style>' +
    '</head>' +
    '<body>' +
    '<div class="sidebar">' +
    '<h2>🏛️ SNS</h2>' +
    '<a href="#" onclick="mostrarSecao(\'dashboard\')">📊 Dashboard</a>' +
    '<a href="#" onclick="mostrarSecao(\'labs\')">🔬 Laboratórios</a>' +
    '<a href="#" onclick="mostrarSecao(\'hospitais\')">🏥 Hospitais</a>' +
    '<a href="#" onclick="mostrarSecao(\'empresas\')">🏢 Empresas</a>' +
    '<button onclick="logout()" class="btn btn-danger" style="margin-top:20px;width:100%;">Sair</button>' +
    '</div>' +
    '<div class="main">' +
    '<div class="header"><h1>Dashboard do Ministério</h1></div>' +

    '<!-- Seção Dashboard -->' +
    '<div id="secaoDashboard">' +
    '<div class="stats">' +
    '<div class="stat-card"><h3>Laboratórios</h3><div class="value" id="totalLabs">0</div></div>' +
    '<div class="stat-card"><h3>Hospitais</h3><div class="value" id="totalHospitais">0</div></div>' +
    '<div class="stat-card"><h3>Empresas</h3><div class="value" id="totalEmpresas">0</div></div>' +
    '</div>' +
    '</div>' +

    '<!-- Seção Laboratórios -->' +
    '<div id="secaoLabs" style="display:none;">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">' +
    '<h2>Laboratórios</h2>' +
    '<button class="btn" onclick="mostrarModalLab()">+ Novo Laboratório</button>' +
    '</div>' +
    '<table><thead><tr><th>Nome</th><th>NIF</th><th>Província</th><th>Total</th><th>Status</th><th>Ações</th></tr></thead><tbody id="labsTable"></tbody></table>' +
    '</div>' +

    '<!-- Seção Hospitais -->' +
    '<div id="secaoHospitais" style="display:none;">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">' +
    '<h2>Hospitais</h2>' +
    '<button class="btn" onclick="mostrarModalHospital()">+ Novo Hospital</button>' +
    '</div>' +
    '<table><thead><tr><th>Nome</th><th>NIF</th><th>Província</th><th>Diretor</th><th>Status</th><th>Ações</th></tr></thead><tbody id="hospitaisTable"></tbody></table>' +
    '</div>' +

    '<!-- Seção Empresas -->' +
    '<div id="secaoEmpresas" style="display:none;">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">' +
    '<h2>Empresas</h2>' +
    '<button class="btn" onclick="mostrarModalEmpresa()">+ Nova Empresa</button>' +
    '</div>' +
    '<table><thead><tr><th>Nome</th><th>NIF</th><th>Responsável</th><th>Status</th><th>Ações</th></tr></thead><tbody id="empresasTable"></tbody></table>' +
    '</div>' +
    '</div>' +

    '<!-- Modal Laboratório -->' +
    '<div id="modalLab" class="modal">' +
    '<div class="modal-content">' +
    '<h3>➕ Novo Laboratório</h3>' +
    '<input type="text" id="labNome" placeholder="Nome do laboratório *">' +
    '<input type="text" id="labNIF" placeholder="NIF (10 dígitos) *" maxlength="10">' +
    '<input type="text" id="labProvincia" placeholder="Província *">' +
    '<input type="text" id="labEndereco" placeholder="Endereço">' +
    '<input type="email" id="labEmail" placeholder="Email *">' +
    '<input type="text" id="labTelefone" placeholder="Telefone">' +
    '<input type="text" id="labDiretor" placeholder="Diretor">' +
    '<div id="labError" class="error-message">NIF deve ter 10 dígitos</div>' +
    '<button class="btn" onclick="criarLaboratorio()">Criar Laboratório</button>' +
    '<button class="btn btn-danger" onclick="fecharModal(\'modalLab\')">Cancelar</button>' +
    '</div>' +
    '</div>' +

    '<!-- Modal Hospital -->' +
    '<div id="modalHospital" class="modal">' +
    '<div class="modal-content">' +
    '<h3>➕ Novo Hospital</h3>' +
    '<input type="text" id="hospitalNome" placeholder="Nome do hospital *">' +
    '<input type="text" id="hospitalNIF" placeholder="NIF (10 dígitos) *" maxlength="10">' +
    '<input type="text" id="hospitalProvincia" placeholder="Província *">' +
    '<input type="text" id="hospitalEndereco" placeholder="Endereço">' +
    '<input type="text" id="hospitalDiretor" placeholder="Diretor *">' +
    '<input type="email" id="hospitalEmail" placeholder="Email *">' +
    '<input type="text" id="hospitalTelefone" placeholder="Telefone">' +
    '<div id="hospitalError" class="error-message">NIF deve ter 10 dígitos</div>' +
    '<button class="btn" onclick="criarHospital()">Criar Hospital</button>' +
    '<button class="btn btn-danger" onclick="fecharModal(\'modalHospital\')">Cancelar</button>' +
    '</div>' +
    '</div>' +

    '<!-- Modal Empresa -->' +
    '<div id="modalEmpresa" class="modal">' +
    '<div class="modal-content">' +
    '<h3>➕ Nova Empresa</h3>' +
    '<input type="text" id="empresaNome" placeholder="Nome da empresa *">' +
    '<input type="text" id="empresaNIF" placeholder="NIF (10 dígitos) *" maxlength="10">' +
    '<input type="text" id="empresaEndereco" placeholder="Endereço">' +
    '<input type="email" id="empresaEmail" placeholder="Email *">' +
    '<input type="text" id="empresaTelefone" placeholder="Telefone">' +
    '<input type="text" id="empresaResp" placeholder="Responsável *">' +
    '<input type="text" id="empresaCargo" placeholder="Cargo do responsável">' +
    '<div id="empresaError" class="error-message">NIF deve ter 10 dígitos</div>' +
    '<button class="btn" onclick="criarEmpresa()">Criar Empresa</button>' +
    '<button class="btn btn-danger" onclick="fecharModal(\'modalEmpresa\')">Cancelar</button>' +
    '</div>' +
    '</div>' +

    '<script>' +
    'const token = localStorage.getItem("token");' +
    'if(!token) window.location.href = "/ministerio";' +

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
    'labs.forEach(l=>{html+="<tr><td>"+l.nome+"</td><td>"+l.nif+"</td><td>"+l.provincia+"</td><td>"+l.totalEmissoes+"</td><td><span class=\'badge "+(l.ativo?"badge-active":"badge-inactive")+"\'>"+(l.ativo?"Ativo":"Inativo")+"</span></td><td><button class=\'btn btn-success\' onclick=\'ativarLab(\\""+l._id+"\\")\' "+(l.ativo?"disabled":"")+">Ativar</button> <button class=\'btn btn-danger\' onclick=\'desativarLab(\\""+l._id+"\\")\' "+(l.ativo?"":"disabled")+">Desativar</button></td></tr>";});' +
    'document.getElementById("labsTable").innerHTML=html;}' +

    'async function carregarHospitais(){' +
    'const r=await fetch("/api/hospitais",{headers:{"Authorization":"Bearer "+token}});' +
    'const hosp=await r.json();' +
    'let html="";' +
    'hosp.forEach(h=>{html+="<tr><td>"+h.nome+"</td><td>"+h.nif+"</td><td>"+h.provincia+"</td><td>"+h.diretor+"</td><td><span class=\'badge "+(h.ativo?"badge-active":"badge-inactive")+"\'>"+(h.ativo?"Ativo":"Inativo")+"</span></td><td><button class=\'btn btn-success\' onclick=\'ativarHospital(\\""+h._id+"\\")\' "+(h.ativo?"disabled":"")+">Ativar</button> <button class=\'btn btn-danger\' onclick=\'desativarHospital(\\""+h._id+"\\")\' "+(h.ativo?"":"disabled")+">Desativar</button></td></tr>";});' +
    'document.getElementById("hospitaisTable").innerHTML=html;}' +

    'async function carregarEmpresas(){' +
    'const r=await fetch("/api/empresas",{headers:{"Authorization":"Bearer "+token}});' +
    'const emp=await r.json();' +
    'let html="";' +
    'emp.forEach(e=>{html+="<tr><td>"+e.nome+"</td><td>"+e.nif+"</td><td>"+e.responsavel.nome+"</td><td><span class=\'badge "+(e.ativo?"badge-active":"badge-inactive")+"\'>"+(e.ativo?"Ativo":"Inativo")+"</span></td><td><button class=\'btn btn-success\' onclick=\'ativarEmpresa(\\""+e._id+"\\")\' "+(e.ativo?"disabled":"")+">Ativar</button> <button class=\'btn btn-danger\' onclick=\'desativarEmpresa(\\""+e._id+"\\")\' "+(e.ativo?"":"disabled")+">Desativar</button></td></tr>";});' +
    'document.getElementById("empresasTable").innerHTML=html;}' +

    'async function criarLaboratorio(){' +
    'const nif=document.getElementById("labNIF").value;' +
    'if(!/^\\d{10}$/.test(nif)){document.getElementById("labError").style.display="block";return;}' +
    'const dados={nome:document.getElementById("labNome").value,nif,provincia:document.getElementById("labProvincia").value,endereco:document.getElementById("labEndereco").value,email:document.getElementById("labEmail").value,telefone:document.getElementById("labTelefone").value,diretor:document.getElementById("labDiretor").value,tipo:"laboratorio"};' +
    'const r=await fetch("/api/labs",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},body:JSON.stringify(dados)});' +
    'const d=await r.json();' +
    'if(d.success){' +
    'const link = document.createElement("a");' +
    'link.href = "/api/labs/pdf/" + d.labId;' +
    'link.download = "credenciais-" + d.labId + ".pdf";' +
    'document.body.appendChild(link);' +
    'link.click();' +
    'document.body.removeChild(link);' +
    'alert("✅ Laboratório criado!\\n\\n🔑 API Key: " + d.apiKey + "\\n\\n📄 PDF com credenciais gerado.");' +
    'fecharModal("modalLab");carregarLabs();}' +
    'else alert("Erro: "+d.erro);}' +

    'async function criarHospital(){' +
    'const nif=document.getElementById("hospitalNIF").value;' +
    'if(!/^\\d{10}$/.test(nif)){document.getElementById("hospitalError").style.display="block";return;}' +
    'const dados={nome:document.getElementById("hospitalNome").value,nif,provincia:document.getElementById("hospitalProvincia").value,endereco:document.getElementById("hospitalEndereco").value,diretor:document.getElementById("hospitalDiretor").value,email:document.getElementById("hospitalEmail").value,telefone:document.getElementById("hospitalTelefone").value};' +
    'const r=await fetch("/api/hospitais",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},body:JSON.stringify(dados)});' +
    'const d=await r.json();' +
    'if(d.success){' +
    'const link = document.createElement("a");' +
    'link.href = "/api/hospitais/pdf/" + d.id;' +
    'link.download = "credenciais-" + d.id + ".pdf";' +
    'document.body.appendChild(link);' +
    'link.click();' +
    'document.body.removeChild(link);' +
    'alert("✅ Hospital criado!\\n\\n🔑 Chave: " + d.chave + "\\n\\n📄 PDF com credenciais gerado.");' +
    'fecharModal("modalHospital");carregarHospitais();}' +
    'else alert("Erro: "+d.erro);}' +

    'async function criarEmpresa(){' +
    'const nif=document.getElementById("empresaNIF").value;' +
    'if(!/^\\d{10}$/.test(nif)){document.getElementById("empresaError").style.display="block";return;}' +
    'const dados={nome:document.getElementById("empresaNome").value,nif,endereco:document.getElementById("empresaEndereco").value,email:document.getElementById("empresaEmail").value,telefone:document.getElementById("empresaTelefone").value,responsavel:{nome:document.getElementById("empresaResp").value,cargo:document.getElementById("empresaCargo").value}};' +
    'const r=await fetch("/api/empresas",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},body:JSON.stringify(dados)});' +
    'const d=await r.json();' +
    'if(d.success){' +
    'const link = document.createElement("a");' +
    'link.href = "/api/empresas/pdf/" + d.id;' +
    'link.download = "credenciais-" + d.id + ".pdf";' +
    'document.body.appendChild(link);' +
    'link.click();' +
    'document.body.removeChild(link);' +
    'alert("✅ Empresa criada!\\n\\n🔑 Chave: " + d.chave + "\\n\\n📄 PDF com credenciais gerado.");' +
    'fecharModal("modalEmpresa");carregarEmpresas();}' +
    'else alert("Erro: "+d.erro);}' +

    'async function ativarLab(id){' +
    'if(!confirm("Ativar laboratório?"))return;' +
    'await fetch("/api/labs/"+id+"/ativar",{method:"POST",headers:{"Authorization":"Bearer "+token}});' +
    'carregarLabs();}' +

    'async function desativarLab(id){' +
    'if(!confirm("Desativar laboratório?"))return;' +
    'await fetch("/api/labs/"+id,{method:"DELETE",headers:{"Authorization":"Bearer "+token}});' +
    'carregarLabs();}' +

    'async function ativarHospital(id){' +
    'if(!confirm("Ativar hospital?"))return;' +
    'await fetch("/api/hospitais/"+id+"/ativar",{method:"POST",headers:{"Authorization":"Bearer "+token}});' +
    'carregarHospitais();}' +

    'async function desativarHospital(id){' +
    'if(!confirm("Desativar hospital?"))return;' +
    'await fetch("/api/hospitais/"+id,{method:"DELETE",headers:{"Authorization":"Bearer "+token}});' +
    'carregarHospitais();}' +

    'async function ativarEmpresa(id){' +
    'if(!confirm("Ativar empresa?"))return;' +
    'await fetch("/api/empresas/"+id+"/ativar",{method:"POST",headers:{"Authorization":"Bearer "+token}});' +
    'carregarEmpresas();}' +

    'async function desativarEmpresa(id){' +
    'if(!confirm("Desativar empresa?"))return;' +
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
    '<html lang="pt">' +
    '<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    '<title>Laboratório - SNS</title>' +
    '<style>' +
    '*{margin:0;padding:0;box-sizing:border-box;font-family:"Segoe UI",Arial;}' +
    'body{display:flex;background:#f5f5f5;}' +
    '.sidebar{width:280px;background:#006633;color:white;height:100vh;padding:20px;position:fixed;overflow-y:auto;}' +
    '.sidebar h2{margin-bottom:30px;font-size:24px;border-bottom:2px solid #ffcc00;padding-bottom:10px;}' +
    '.sidebar a{display:block;color:white;text-decoration:none;padding:12px;margin:5px 0;border-radius:8px;transition:0.3s;}' +
    '.sidebar a:hover{background:#004d26;padding-left:20px;}' +
    '.main{margin-left:300px;padding:30px;flex:1;}' +
    '.welcome-banner{background:linear-gradient(135deg,#e8f5e9,#ffffff);padding:25px;border-radius:10px;margin-bottom:20px;border-left:5px solid #006633;box-shadow:0 2px 10px rgba(0,0,0,0.1);}' +
    '.welcome-banner h1{color:#006633;margin-bottom:5px;}' +
    '.welcome-banner p{color:#666;}' +
    '.btn{background:#006633;color:white;border:none;padding:12px 20px;border-radius:8px;cursor:pointer;margin:5px;font-size:14px;}' +
    '.btn:hover{background:#004d26;}' +
    '.btn-danger{background:#dc3545;}' +
    '.btn-danger:hover{background:#c82333;}' +
    '.cert-type-selector{margin:20px 0;display:flex;gap:10px;flex-wrap:wrap;}' +
    '.cert-type-btn{padding:15px 20px;background:#f5f5f5;border:2px solid #ddd;border-radius:10px;cursor:pointer;flex:1;text-align:center;}' +
    '.cert-type-btn.selected{background:#006633;color:white;border-color:#006633;}' +
    '.modal{display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);align-items:center;justify-content:center;z-index:1000;}' +
    '.modal-content{background:white;padding:30px;border-radius:10px;width:600px;max-width:90%;max-height:80vh;overflow-y:auto;}' +
    '.modal-content h3{color:#006633;margin-bottom:20px;}' +
    '.modal-content input,.modal-content select{width:100%;padding:10px;margin:10px 0;border:1px solid #ddd;border-radius:5px;}' +
    'table{width:100%;background:white;border-radius:10px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,0.1);margin-top:20px;}' +
    'th{background:#006633;color:white;padding:12px;text-align:left;}' +
    'td{padding:10px;border-bottom:1px solid #eee;}' +
    '</style>' +
    '</head>' +
    '<body>' +
    '<div class="sidebar">' +
    '<h2>🔬 SNS</h2>' +
    '<a href="#" onclick="mostrarSecao(\'dashboard\')">📊 Dashboard</a>' +
    '<a href="#" onclick="mostrarSecao(\'certificados\')">📋 Certificados</a>' +
    '<button onclick="logout()" class="btn btn-danger" style="margin-top:20px;width:100%;">Sair</button>' +
    '</div>' +
    '<div class="main">' +
    '<div id="welcomeBanner" class="welcome-banner"></div>' +

    '<div id="secaoDashboard">' +
    '<h2>Dashboard</h2>' +
    '<div style="background:white;padding:20px;border-radius:10px;margin-top:20px;">' +
    '<p>Total de certificados emitidos: <strong id="totalCerts">0</strong></p>' +
    '</div>' +
    '</div>' +

    '<div id="secaoCertificados" style="display:none;">' +
    '<h2>Emissão de Certificados</h2>' +
    '<div class="cert-type-selector">' +
    '<div class="cert-type-btn" onclick="selecionarTipo(1)" id="tipo1">🧬 Genótipo</div>' +
    '<div class="cert-type-btn" onclick="selecionarTipo(2)" id="tipo2">🩺 Boa Saúde</div>' +
    '<div class="cert-type-btn" onclick="selecionarTipo(3)" id="tipo3">📋 Incapacidade</div>' +
    '<div class="cert-type-btn" onclick="selecionarTipo(4)" id="tipo4">💪 Aptidão</div>' +
    '<div class="cert-type-btn" onclick="selecionarTipo(5)" id="tipo5">🤰 Saúde Materna</div>' +
    '<div class="cert-type-btn" onclick="selecionarTipo(6)" id="tipo6">🤰 Pré-Natal (CPN)</div>' +
    '<div class="cert-type-btn" onclick="selecionarTipo(7)" id="tipo7">🦠 Epidemiológico</div>' +
    '</div>' +
    '<button class="btn" onclick="mostrarModalCertificado()" style="margin:20px 0;">+ Novo Certificado</button>' +
    '<table><thead><tr><th>Número</th><th>Tipo</th><th>Paciente</th><th>Data</th><th>Ações</th></tr></thead><tbody id="certTable"></tbody></table>' +
    '</div>' +
    '</div>' +

    '<!-- Modal Genótipo (tipo 1) -->' +
    '<div id="modalCert1" class="modal">' +
    '<div class="modal-content">' +
    '<h3>🧬 Certificado de Genótipo</h3>' +
    '<input type="text" id="cert1Nome" placeholder="Nome completo *">' +
    '<select id="cert1Genero"><option value="M">Masculino</option><option value="F">Feminino</option></select>' +
    '<input type="date" id="cert1DataNasc" placeholder="Data nascimento *">' +
    '<input type="text" id="cert1BI" placeholder="BI *">' +
    '<select id="cert1Genotipo"><option value="AA">AA</option><option value="AS">AS</option><option value="SS">SS</option></select>' +
    '<select id="cert1Grupo"><option value="A+">A+</option><option value="A-">A-</option><option value="B+">B+</option><option value="B-">B-</option><option value="AB+">AB+</option><option value="AB-">AB-</option><option value="O+">O+</option><option value="O-">O-</option></select>' +
    '<button class="btn" onclick="emitirCertificado(1)">Emitir Certificado</button>' +
    '<button class="btn btn-danger" onclick="fecharModal()">Cancelar</button>' +
    '</div>' +
    '</div>' +

    '<!-- Modal CPN (tipo 6) -->' +
    '<div id="modalCert6" class="modal">' +
    '<div class="modal-content">' +
    '<h3>🤰 Certificado Pré-Natal (CPN)</h3>' +
    '<input type="text" id="cert6Nome" placeholder="Nome completo *">' +
    '<input type="date" id="cert6DataNasc" placeholder="Data nascimento *">' +
    '<input type="text" id="cert6BI" placeholder="BI *">' +
    '<input type="number" id="cert6Gestacoes" placeholder="Nº de gestações">' +
    '<input type="number" id="cert6Partos" placeholder="Nº de partos">' +
    '<input type="date" id="cert6DPP" placeholder="Data provável do parto">' +
    '<input type="number" id="cert6IG" placeholder="Idade gestacional (semanas)">' +
    '<select id="cert6Genotipo"><option value="">Genótipo...</option><option value="AA">AA</option><option value="AS">AS</option><option value="SS">SS</option></select>' +
    '<select id="cert6VIH"><option value="">VIH...</option><option value="Negativo">Negativo</option><option value="Positivo">Positivo</option></select>' +
    '<select id="cert6Malaria"><option value="">Malária...</option><option value="Negativo">Negativo</option><option value="Positivo">Positivo</option></select>' +
    '<button class="btn" onclick="emitirCertificado(6)">Emitir CPN</button>' +
    '<button class="btn btn-danger" onclick="fecharModal()">Cancelar</button>' +
    '</div>' +
    '</div>' +

    '<!-- Modal Epidemiológico (tipo 7) -->' +
    '<div id="modalCert7" class="modal">' +
    '<div class="modal-content">' +
    '<h3>🦠 Certificado Epidemiológico</h3>' +
    '<input type="text" id="cert7Nome" placeholder="Nome completo *">' +
    '<input type="date" id="cert7DataNasc" placeholder="Data nascimento *">' +
    '<input type="text" id="cert7BI" placeholder="BI *">' +
    '<select id="cert7Doenca"><option value="Febre Amarela">Febre Amarela</option><option value="Ebola">Ebola</option><option value="COVID-19">COVID-19</option><option value="Cólera">Cólera</option></select>' +
    '<input type="date" id="cert7DataExame" placeholder="Data do exame *">' +
    '<select id="cert7Metodo"><option value="PCR">PCR</option><option value="Teste Rápido">Teste Rápido</option><option value="Sorologia">Sorologia</option></select>' +
    '<select id="cert7Resultado"><option value="Negativo">Negativo</option><option value="Positivo">Positivo</option><option value="Inconclusivo">Inconclusivo</option></select>' +
    '<button class="btn" onclick="emitirCertificado(7)">Emitir Certificado</button>' +
    '<button class="btn btn-danger" onclick="fecharModal()">Cancelar</button>' +
    '</div>' +
    '</div>' +

    '<script>' +
    'const labKey = localStorage.getItem("labKey");' +
    'if(!labKey) window.location.href = "/lab-login";' +
    'let tipoSelecionado = 1;' +

    'async function carregarLab() {' +
    'const r = await fetch("/api/labs/me",{headers:{"x-api-key":labKey}});' +
    'const lab = await r.json();' +
    'if(lab){' +
    'document.getElementById("welcomeBanner").innerHTML = "<h1>👋 Olá, " + lab.nome + "!</h1><p>💪 Pronto para mais um dia de trabalho? Vamos juntos!</p><p><strong>NIF:</strong> " + lab.nif + " | <strong>Província:</strong> " + lab.provincia + "</p>";' +
    '}}' +

    'function mostrarSecao(s){' +
    'document.getElementById("secaoDashboard").style.display="none";' +
    'document.getElementById("secaoCertificados").style.display="none";' +
    'if(s==="dashboard"){document.getElementById("secaoDashboard").style.display="block";carregarStats();}' +
    'if(s==="certificados"){document.getElementById("secaoCertificados").style.display="block";carregarCertificados();}}' +

    'function selecionarTipo(tipo){' +
    'tipoSelecionado = tipo;' +
    'for(let i=1;i<=7;i++){document.getElementById("tipo"+i).classList.remove("selected");}' +
    'document.getElementById("tipo"+tipo).classList.add("selected");}' +

    'function mostrarModalCertificado(){' +
    'for(let i=1;i<=7;i++){document.getElementById("modalCert"+i).style.display="none";}' +
    'document.getElementById("modalCert"+tipoSelecionado).style.display="flex";}' +

    'function fecharModal(){' +
    'for(let i=1;i<=7;i++){document.getElementById("modalCert"+i).style.display="none";}}' +

    'async function carregarStats(){' +
    'const r=await fetch("/api/certificados/lab",{headers:{"x-api-key":labKey}});' +
    'const certs=await r.json();' +
    'document.getElementById("totalCerts").innerText=certs.length;}' +

    'async function carregarCertificados(){' +
    'const r=await fetch("/api/certificados/lab",{headers:{"x-api-key":labKey}});' +
    'const certs=await r.json();' +
    'let html="";' +
    'const tipos=["","🧬 Genótipo","🩺 Boa Saúde","📋 Incapacidade","💪 Aptidão","🤰 Saúde Materna","🤰 CPN","🦠 Epidemiológico"];' +
    'certs.forEach(c=>{html+="<tr><td>"+c.numero+"</td><td>"+tipos[c.tipo]+"</td><td>"+c.paciente.nomeCompleto+"</td><td>"+new Date(c.emitidoEm).toLocaleDateString()+"</td><td><button class=\'btn\' onclick=\'downloadPDF(\\""+c.numero+"\\")\'>📥 PDF</button></td></tr>";});' +
    'document.getElementById("certTable").innerHTML=html;}' +

    'async function downloadPDF(numero){' +
    'window.open("/api/certificados/"+numero+"/pdf", "_blank");}' +

    'async function emitirCertificado(tipo){' +
    'let dados = {};' +
    'let paciente = {};' +

    'if(tipo === 1){' +
    'paciente = {nomeCompleto:document.getElementById("cert1Nome").value, genero:document.getElementById("cert1Genero").value, dataNascimento:document.getElementById("cert1DataNasc").value, bi:document.getElementById("cert1BI").value};' +
    'dados = {genotipo:document.getElementById("cert1Genotipo").value, grupoSanguineo:document.getElementById("cert1Grupo").value};}' +

    'else if(tipo === 6){' +
    'paciente = {nomeCompleto:document.getElementById("cert6Nome").value, dataNascimento:document.getElementById("cert6DataNasc").value, bi:document.getElementById("cert6BI").value};' +
    'dados = {gestacoes:document.getElementById("cert6Gestacoes").value, partos:document.getElementById("cert6Partos").value, dpp:document.getElementById("cert6DPP").value, ig:document.getElementById("cert6IG").value, exames:{genotipo:document.getElementById("cert6Genotipo").value, vih:document.getElementById("cert6VIH").value, malaria:document.getElementById("cert6Malaria").value}};}' +

    'else if(tipo === 7){' +
    'paciente = {nomeCompleto:document.getElementById("cert7Nome").value, dataNascimento:document.getElementById("cert7DataNasc").value, bi:document.getElementById("cert7BI").value};' +
    'dados = {doenca:document.getElementById("cert7Doenca").value, dataExame:document.getElementById("cert7DataExame").value, metodo:document.getElementById("cert7Metodo").value, resultado:document.getElementById("cert7Resultado").value};}' +

    'const r = await fetch("/api/certificados/emitir/"+tipo, {' +
    'method:"POST", headers:{"Content-Type":"application/json","x-api-key":labKey},' +
    'body:JSON.stringify({paciente,dados})});' +
    'const res = await r.json();' +
    'if(res.success){' +
    'alert("✅ Certificado emitido com sucesso! Nº: " + res.numero);' +
    'fecharModal();' +
    'carregarCertificados();' +
    'downloadPDF(res.numero);}' +
    'else alert("Erro: " + res.erro);}' +

    'function logout(){localStorage.removeItem("labKey");window.location.href="/";}' +
    'carregarLab();' +
    'mostrarSecao("dashboard");' +
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

app.get('/api/labs/pdf/:labId', authMiddleware, async (req, res) => {
    try {
        const lab = await Lab.findOne({ labId: req.params.labId });
        if (!lab) return res.status(404).json({ erro: 'Laboratório não encontrado' });
        
        const pdf = await gerarPDFCredenciais(lab, 'laboratorio', lab.apiKey);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=credenciais-' + lab.labId + '.pdf');
        res.send(pdf);
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao gerar PDF' });
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
        
        const chave = gerarChaveAcesso('hospital');
        const hospital = new Hospital({ ...dados, chaveAcesso: chave });
        await hospital.save();
        
        res.json({ success: true, id: hospital._id, chave });
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

app.post('/api/hospitais/:id/ativar', authMiddleware, async (req, res) => {
    try {
        await Hospital.findByIdAndUpdate(req.params.id, { ativo: true });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ erro: 'Erro interno' });
    }
});

app.get('/api/hospitais/pdf/:id', authMiddleware, async (req, res) => {
    try {
        const hospital = await Hospital.findById(req.params.id);
        if (!hospital) return res.status(404).json({ erro: 'Hospital não encontrado' });
        
        const pdf = await gerarPDFCredenciais(hospital, 'hospital', hospital.chaveAcesso);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=credenciais-hospital.pdf');
        res.send(pdf);
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao gerar PDF' });
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
        
        const chave = gerarChaveAcesso('empresa');
        const empresa = new Empresa({ ...dados, chaveAcesso: chave });
        await empresa.save();
        
        res.json({ success: true, id: empresa._id, chave });
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

app.post('/api/empresas/:id/ativar', authMiddleware, async (req, res) => {
    try {
        await Empresa.findByIdAndUpdate(req.params.id, { ativo: true });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ erro: 'Erro interno' });
    }
});

app.get('/api/empresas/pdf/:id', authMiddleware, async (req, res) => {
    try {
        const empresa = await Empresa.findById(req.params.id);
        if (!empresa) return res.status(404).json({ erro: 'Empresa não encontrada' });
        
        const pdf = await gerarPDFCredenciais(empresa, 'empresa', empresa.chaveAcesso);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=credenciais-empresa.pdf');
        res.send(pdf);
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao gerar PDF' });
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
        const hash = crypto.createHash('sha256').update(numero + JSON.stringify(dados) + Date.now()).digest('hex');
        
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

app.get('/api/certificados/:numero/pdf', async (req, res) => {
    try {
        const cert = await Certificate.findOne({ numero: req.params.numero });
        if (!cert) return res.status(404).json({ erro: 'Certificado não encontrado' });
        
        let pdf;
        if (cert.tipo === 1) pdf = await gerarPDFGenotipo(cert);
        else if (cert.tipo === 6) pdf = await gerarPDFCPN(cert);
        else if (cert.tipo === 7) pdf = await gerarPDFEpidemico(cert);
        else return res.status(400).json({ erro: 'Tipo de certificado sem PDF específico' });
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=' + cert.numero + '.pdf');
        res.send(pdf);
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao gerar PDF' });
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
// Adicione antes do app.listen
app.get('/criar-admin', async (req, res) => {
    try {
        const senhaHash = await bcrypt.hash('Admin@2025', 10);
        await User.deleteMany({ email: 'admin@sns.gov.ao' });
        await User.create({
            nome: 'Administrador',
            email: 'admin@sns.gov.ao',
            password: senhaHash,
            role: 'admin'
        });
        res.send('✅ Admin recriado com sucesso!');
    } catch (e) {
        res.send('Erro: ' + e.message);
    }
});
app.listen(PORT, () => {
    console.log('\n' + '='.repeat(50));
    console.log('🚀 SNS - SISTEMA NACIONAL DE SAÚDE');
    console.log('='.repeat(50));
    console.log('📱 URL: http://localhost:' + PORT);
    console.log('🏛️ Ministério: /ministerio (admin@sns.gov.ao / Admin@2025)');
    console.log('🔬 Laboratório: /lab-login (com API Key)');
    console.log('📄 PDF de credenciais: gerado automaticamente');
    console.log('✅ Botões Ativar/Desativar funcionais');
    console.log('🎯 7 tipos de certificados disponíveis');
    console.log('='.repeat(50) + '\n');
});