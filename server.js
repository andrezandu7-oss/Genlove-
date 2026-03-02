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
async function gerarPDFCredenciais(entidade, tipo, chave) {
    return new Promise((resolve) => {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => resolve(Buffer.concat(buffers)));

        doc.fontSize(20).fillColor('#006633').text('REPÚBLICA DE ANGOLA', { align: 'center' })
           .fontSize(16).text('MINISTÉRIO DA SAÚDE', { align: 'center' })
           .fontSize(18).text('SISTEMA NACIONAL DE SAÚDE', { align: 'center' })
           .moveDown(2)
           .fontSize(16).text('CREDENCIAIS DE ACESSO', { align: 'center' })
           .moveDown(2);

        doc.strokeColor('#006633').lineWidth(2).moveTo(50, doc.y).lineTo(550, doc.y).stroke().moveDown(2);

        doc.fontSize(12).fillColor('black')
           .text('Tipo: ' + (tipo === 'hospital' ? 'HOSPITAL' : 'EMPRESA'))
           .text('Nome: ' + entidade.nome)
           .text('NIF: ' + entidade.nif)
           .text('Endereço: ' + (entidade.endereco || 'Não informado'))
           .text('Email: ' + entidade.email)
           .text('Responsável: ' + (entidade.diretor || entidade.responsavel?.nome || 'Não informado'))
           .moveDown();

        doc.fontSize(14).fillColor('#006633').text('CHAVE DE ACESSO:', { align: 'center' })
           .fontSize(16).fillColor('#000000').text(chave, { align: 'center', underline: true })
           .moveDown(2);

        doc.fontSize(10).fillColor('#FF0000')
           .text('⚠️ AVISO: Esta chave é de uso EXCLUSIVO da entidade acima.', { align: 'center' })
           .text('NÃO COMPARTILHE com terceiros não autorizados.', { align: 'center' })
           .moveDown(2);

        doc.fontSize(8).fillColor('#999999')
           .text('Documento gerado em ' + new Date().toLocaleString('pt-AO'), { align: 'center' });

        doc.end();
    });
}

async function gerarPDFCertificado(cert) {
    return new Promise((resolve) => {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => resolve(Buffer.concat(buffers)));

        doc.fontSize(20).fillColor('#006633').text('REPÚBLICA DE ANGOLA', { align: 'center' })
           .fontSize(16).text('MINISTÉRIO DA SAÚDE', { align: 'center' })
           .fontSize(18).text('CERTIFICADO MÉDICO OFICIAL', { align: 'center' })
           .moveDown()
           .fontSize(10).text('Nº: ' + cert.numero, { align: 'right' })
           .moveDown();

        const tipos = ['', 'GENÓTIPO', 'BOA SAÚDE', 'INCAPACIDADE', 'APTIDÃO', 'SAÚDE MATERNA', 'PRÉ-NATAL (CPN)', 'EPIDEMIOLÓGICO'];
        
        doc.fontSize(14).fillColor('#006633').text(tipos[cert.tipo], { underline: true })
           .fontSize(12).fillColor('black')
           .text('Paciente: ' + cert.paciente.nomeCompleto)
           .text('BI: ' + cert.paciente.bi)
           .text('Data Nascimento: ' + new Date(cert.paciente.dataNascimento).toLocaleDateString('pt-AO'))
           .moveDown();

        if (cert.tipo === 1) {
            doc.text('Genótipo: ' + cert.dados.genotipo)
               .text('Grupo Sanguíneo: ' + cert.dados.grupoSanguineo);
        } else if (cert.tipo === 6) {
            doc.text('Gestações: ' + (cert.dados.gestacoes || 'N/A'))
               .text('Partos: ' + (cert.dados.partos || 'N/A'))
               .text('Genótipo: ' + (cert.dados.exames?.genotipo || 'N/A'))
               .text('VIH: ' + (cert.dados.exames?.vih || 'N/A'));
        } else if (cert.tipo === 7) {
            doc.text('Doença: ' + cert.dados.doenca)
               .text('Data do Exame: ' + new Date(cert.dados.dataExame).toLocaleDateString('pt-AO'))
               .text('Resultado: ' + cert.dados.resultado);
        }

        doc.moveDown(2)
           .fontSize(8).fillColor('#666')
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

// ============================================
// LABORATÓRIO - LOGIN (CORRIGIDO)
// ============================================
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
// ROTA PARA CRIAR ADMIN (EMERGÊNCIA)
// ============================================
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
        res.send('<h1>✅ Admin criado com sucesso!</h1><p>Email: admin@sns.gov.ao</p><p>Senha: Admin@2025</p><a href="/ministerio">Voltar ao login</a>');
    } catch (e) {
        res.send('Erro: ' + e.message);
    }
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

// ============================================
// DASHBOARD DO MINISTÉRIO
// ============================================
app.get('/admin-dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// ============================================
// DASHBOARD DO LABORATÓRIO (CORRIGIDO)
// ============================================
app.get('/lab-dashboard', (req, res) => {
    res.send('<!DOCTYPE html>' +
    '<html>' +
    '<head><meta charset="UTF-8"><title>Laboratório - SNS</title>' +
    '<style>' +
    '*{margin:0;padding:0;box-sizing:border-box;font-family:Arial;}' +
    'body{display:flex;background:#f5f5f5;}' +
    '.sidebar{width:250px;background:#006633;color:white;height:100vh;padding:20px;position:fixed;}' +
    '.sidebar h2{margin-bottom:30px;}' +
    '.sidebar a{display:block;color:white;text-decoration:none;padding:10px;margin:5px 0;}' +
    '.sidebar a:hover{background:#004d26;}' +
    '.main{margin-left:270px;padding:30px;width:100%;}' +
    '.welcome{background:#e8f5e9;padding:20px;border-left:5px solid #006633;margin-bottom:20px;}' +
    '.btn{background:#006633;color:white;border:none;padding:10px 20px;cursor:pointer;margin:5px;border-radius:5px;}' +
    '.btn:hover{background:#004d26;}' +
    '.btn-danger{background:#dc3545;}' +
    '.btn-danger:hover{background:#c82333;}' +
    '.tipo-selector{margin:20px 0;display:flex;gap:10px;flex-wrap:wrap;}' +
    '.tipo-btn{padding:10px;background:#f5f5f5;border:1px solid #ddd;cursor:pointer;}' +
    '.tipo-btn.selected{background:#006633;color:white;}' +
    '.modal{display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);align-items:center;justify-content:center;}' +
    '.modal-content{background:white;padding:20px;border-radius:10px;width:500px;max-height:80vh;overflow-y:auto;}' +
    '.modal-content input,.modal-content select{width:100%;padding:8px;margin:5px 0;}' +
    'table{width:100%;background:white;border-collapse:collapse;margin-top:20px;}' +
    'th{background:#006633;color:white;padding:10px;}' +
    'td{padding:10px;border-bottom:1px solid #ddd;}' +
    '</style>' +
    '</head>' +
    '<body>' +
    '<div class="sidebar">' +
    '<h2>SNS</h2>' +
    '<a href="#" onclick="mostrar(\'dashboard\')">📊 Dashboard</a>' +
    '<a href="#" onclick="mostrar(\'certificados\')">📋 Certificados</a>' +
    '<button onclick="logout()" class="btn btn-danger" style="margin-top:20px;width:100%;">Sair</button>' +
    '</div>' +
    '<div class="main">' +
    '<div id="welcome" class="welcome"></div>' +
    '<div id="dashboard">' +
    '<h2>Dashboard</h2>' +
    '<p>Total de certificados: <span id="total">0</span></p>' +
    '</div>' +
    '<div id="certificados" style="display:none;">' +
    '<h2>Certificados</h2>' +
    '<div class="tipo-selector">' +
    '<div class="tipo-btn" onclick="setTipo(1)" id="tipo1">Genótipo</div>' +
    '<div class="tipo-btn" onclick="setTipo(2)" id="tipo2">Boa Saúde</div>' +
    '<div class="tipo-btn" onclick="setTipo(3)" id="tipo3">Incapacidade</div>' +
    '<div class="tipo-btn" onclick="setTipo(4)" id="tipo4">Aptidão</div>' +
    '<div class="tipo-btn" onclick="setTipo(5)" id="tipo5">Materna</div>' +
    '<div class="tipo-btn" onclick="setTipo(6)" id="tipo6">CPN</div>' +
    '<div class="tipo-btn" onclick="setTipo(7)" id="tipo7">Epidemio</div>' +
    '</div>' +
    '<button class="btn" onclick="abrirModal()">+ Novo Certificado</button>' +
    '<table><thead><tr><th>Número</th><th>Tipo</th><th>Paciente</th><th>Data</th><th>PDF</th></tr></thead><tbody id="tabela"></tbody></table>' +
    '</div>' +
    '</div>' +

    // Modais
    '<div id="modal1" class="modal">' +
    '<div class="modal-content">' +
    '<h3>Genótipo</h3>' +
    '<input id="nome1" placeholder="Nome">' +
    '<select id="gen1"><option value="M">Masculino</option><option value="F">Feminino</option></select>' +
    '<input type="date" id="data1">' +
    '<input id="bi1" placeholder="BI">' +
    '<select id="geno1"><option value="AA">AA</option><option value="AS">AS</option><option value="SS">SS</option></select>' +
    '<select id="grupo1"><option value="A+">A+</option><option value="A-">A-</option><option value="B+">B+</option><option value="B-">B-</option><option value="O+">O+</option><option value="O-">O-</option></select>' +
    '<button class="btn" onclick="emitir(1)">Emitir</button>' +
    '<button class="btn btn-danger" onclick="fechar(1)">Cancelar</button>' +
    '</div></div>' +

    '<div id="modal6" class="modal">' +
    '<div class="modal-content">' +
    '<h3>CPN</h3>' +
    '<input id="nome6" placeholder="Nome">' +
    '<input type="date" id="data6">' +
    '<input id="bi6" placeholder="BI">' +
    '<input id="gest6" placeholder="Gestações">' +
    '<input id="part6" placeholder="Partos">' +
    '<select id="gen6"><option value="">Genótipo</option><option value="AA">AA</option><option value="AS">AS</option><option value="SS">SS</option></select>' +
    '<select id="vih6"><option value="">VIH</option><option value="Negativo">Negativo</option><option value="Positivo">Positivo</option></select>' +
    '<button class="btn" onclick="emitir(6)">Emitir</button>' +
    '<button class="btn btn-danger" onclick="fechar(6)">Cancelar</button>' +
    '</div></div>' +

    '<div id="modal7" class="modal">' +
    '<div class="modal-content">' +
    '<h3>Epidemiológico</h3>' +
    '<input id="nome7" placeholder="Nome">' +
    '<input type="date" id="data7">' +
    '<input id="bi7" placeholder="BI">' +
    '<select id="doenca7"><option value="Febre Amarela">Febre Amarela</option><option value="Ebola">Ebola</option><option value="COVID-19">COVID-19</option></select>' +
    '<input type="date" id="exame7">' +
    '<select id="resul7"><option value="Negativo">Negativo</option><option value="Positivo">Positivo</option></select>' +
    '<button class="btn" onclick="emitir(7)">Emitir</button>' +
    '<button class="btn btn-danger" onclick="fechar(7)">Cancelar</button>' +
    '</div></div>' +

    '<script>' +
    'const key=localStorage.getItem("labKey");' +
    'if(!key) window.location.href="/lab-login";' +
    'let tipoAtual=1;' +

    'async function carregarLab(){' +
    'try{' +
    'const r=await fetch("/api/labs/me",{headers:{"x-api-key":key}});' +
    'const d=await r.json();' +
    'document.getElementById("welcome").innerHTML="<h2>👋 Olá, "+d.nome+"!</h2><p>💪 Pronto para mais um dia de trabalho? Vamos juntos!</p>";' +
    '}catch(e){}}' +

    'function mostrar(s){' +
    'document.getElementById("dashboard").style.display="none";' +
    'document.getElementById("certificados").style.display="none";' +
    'document.getElementById(s).style.display="block";' +
    'if(s==="certificados") carregarLista();' +
    '}' +

    'function setTipo(t){' +
    'tipoAtual=t;' +
    'for(let i=1;i<=7;i++) document.getElementById("tipo"+i).classList.remove("selected");' +
    'document.getElementById("tipo"+t).classList.add("selected");' +
    '}' +

    'function abrirModal(){' +
    'for(let i=1;i<=7;i++) document.getElementById("modal"+i).style.display="none";' +
    'document.getElementById("modal"+tipoAtual).style.display="flex";' +
    '}' +

    'function fechar(t){document.getElementById("modal"+t).style.display="none";}' +

    'async function carregarLista(){' +
    'const r=await fetch("/api/certificados/lab",{headers:{"x-api-key":key}});' +
    'const lista=await r.json();' +
    'document.getElementById("total").innerText=lista.length;' +
    'let html="";' +
    'const tipos=["","Genótipo","Boa Saúde","Incapacidade","Aptidão","Materna","CPN","Epidemio"];' +
    'lista.forEach(c=>{html+="<tr><td>"+c.numero+"</td><td>"+tipos[c.tipo]+"</td><td>"+c.paciente.nomeCompleto+"</td><td>"+new Date(c.emitidoEm).toLocaleDateString()+"</td><td><button class=\'btn\' onclick=\'baixar(\\""+c.numero+"\\")\'>PDF</button></td></tr>";});' +
    'document.getElementById("tabela").innerHTML=html;' +
    '}' +

    'function baixar(num){window.open("/api/certificados/"+num+"/pdf","_blank");}' +

    'async function emitir(t){' +
    'let dados={}, paciente={};' +
    'if(t===1){' +
    'paciente={nomeCompleto:document.getElementById("nome1").value,genero:document.getElementById("gen1").value,dataNascimento:document.getElementById("data1").value,bi:document.getElementById("bi1").value};' +
    'dados={genotipo:document.getElementById("geno1").value,grupoSanguineo:document.getElementById("grupo1").value};}' +
    'else if(t===6){' +
    'paciente={nomeCompleto:document.getElementById("nome6").value,dataNascimento:document.getElementById("data6").value,bi:document.getElementById("bi6").value};' +
    'dados={gestacoes:document.getElementById("gest6").value,partos:document.getElementById("part6").value,exames:{genotipo:document.getElementById("gen6").value,vih:document.getElementById("vih6").value}};}' +
    'else if(t===7){' +
    'paciente={nomeCompleto:document.getElementById("nome7").value,dataNascimento:document.getElementById("data7").value,bi:document.getElementById("bi7").value};' +
    'dados={doenca:document.getElementById("doenca7").value,dataExame:document.getElementById("exame7").value,resultado:document.getElementById("resul7").value}};' +

    'const r=await fetch("/api/certificados/emitir/"+t,{method:"POST",headers:{"Content-Type":"application/json","x-api-key":key},body:JSON.stringify({paciente,dados})});' +
    'const res=await r.json();' +
    'if(res.success){alert("✅ Certificado emitido! Nº: "+res.numero);fechar(t);carregarLista();baixar(res.numero);}' +
    'else alert("Erro: "+res.erro);' +
    '}' +

    'function logout(){localStorage.removeItem("labKey");window.location.href="/";}' +
    'carregarLab();' +
    'mostrar("dashboard");' +
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
        
        const pdf = await gerarPDFCertificado(cert);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=' + cert.numero + '.pdf');
        res.send(pdf);
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao gerar PDF' });
    }
});

// ============================================
// API DE HOSPITAIS E EMPRESAS (MINISTÉRIO)
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
    console.log('🚀 SNS - SISTEMA NACIONAL DE SAÚDE');
    console.log('='.repeat(50));
    console.log('📱 URL: http://localhost:' + PORT);
    console.log('🏛️ Ministério: /ministerio (admin@sns.gov.ao / Admin@2025)');
    console.log('🔬 Laboratório: /lab-login (com API Key)');
    console.log('📄 PDF de credenciais e certificados: OK');
    console.log('✅ Botões funcionais e validação de chave');
    console.log('='.repeat(50) + '\n');
});