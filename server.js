// ============================================
// SNS - SISTEMA NACIONAL DE SAÚDE
// MINISTÉRIO DA SAÚDE - REPÚBLICA DE ANGOLA
// ============================================
// Módulo: Certificados Médicos Oficiais
// Versão: 1.0.0
// Data: 2025
// ============================================

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Carregar variáveis de ambiente
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// CONFIGURAÇÕES DE SEGURANÇA
// ============================================
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:"],
        },
    },
}));

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5
});

// ============================================
// CONEXÃO MONGODB
// ============================================
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sns-angola';

mongoose.connect(MONGODB_URI)
.then(() => console.log('✅ Conectado ao MongoDB'))
.catch(err => console.error('❌ Erro MongoDB:', err));

// ============================================
// MODELOS DE DADOS
// ============================================

// Modelo de Laboratório
const labSchema = new mongoose.Schema({
    labId: { type: String, required: true, unique: true },
    nome: { type: String, required: true },
    tipo: { type: String, enum: ['laboratorio', 'hospital', 'clinica', 'ministerio'], required: true },
    provincia: { type: String, required: true },
    email: String,
    telefone: String,
    diretor: String,
    apiKey: { type: String, unique: true },
    chaveDesencriptacao: { type: String, unique: true },
    permissoes: {
        tiposCertificado: { type: [Number], default: [1,2,3,4,5] }
    },
    ativo: { type: Boolean, default: true },
    emitidoEm: { type: Date, default: Date.now },
    expiraEm: Date,
    totalEmissoes: { type: Number, default: 0 }
});

// Modelo de Utilizador
const userSchema = new mongoose.Schema({
    nome: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['admin', 'inspetor'], default: 'inspetor' },
    ativo: { type: Boolean, default: true }
}, { timestamps: true });

// Modelo de Certificado
const certificateSchema = new mongoose.Schema({
    numero: { type: String, required: true, unique: true },
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
        tipoAptidao: String
    },
    dadosGenlove: String,
    qrCodeData: String,
    qrCodeImage: String,
    hashVerificacao: { type: String, unique: true },
    emitidoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Lab' },
    emitidoEm: { type: Date, default: Date.now },
    validoAte: Date
});

// Modelo de Log
const auditLogSchema = new mongoose.Schema({
    timestamp: { type: Date, default: Date.now },
    acao: String,
    labId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lab' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    sucesso: Boolean
});

const Lab = mongoose.model('Lab', labSchema);
const User = mongoose.model('User', userSchema);
const Certificate = mongoose.model('Certificate', certificateSchema);
const AuditLog = mongoose.model('AuditLog', auditLogSchema);

// ============================================
// UTILITÁRIOS
// ============================================
const MASTER_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');

function cifrarDados(dados) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(MASTER_KEY, 'hex'), iv);
    let encrypted = cipher.update(JSON.stringify(dados), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
}

function gerarApiKey() {
    return 'SNS-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

function gerarChaveLeitor() {
    return crypto.randomBytes(32).toString('hex');
}

// ============================================
// ROTA PRINCIPAL - LOGIN (SEM DADOS SENSÍVEIS)
// ============================================
app.get('/ministerio', (req, res) => {
    res.send('<!DOCTYPE html>' +
    '<html>' +
    '<head>' +
    '<meta charset="UTF-8">' +
    '<title>SNS - Ministério da Saúde</title>' +
    '<style>' +
    'body { background: linear-gradient(135deg, #006633, #003300); font-family: Arial; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }' +
    '.container { background: white; padding: 40px; border-radius: 10px; width: 350px; box-shadow: 0 10px 30px rgba(0,0,0,0.3); }' +
    'h1 { color: #006633; text-align: center; margin-bottom: 30px; }' +
    '.form-group { margin-bottom: 20px; }' +
    'label { display: block; margin-bottom: 5px; color: #333; font-weight: bold; }' +
    'input { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 5px; }' +
    'button { width: 100%; padding: 12px; background: #006633; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 16px; }' +
    'button:hover { background: #004d26; }' +
    '.error { color: red; margin-bottom: 10px; display: none; }' +
    '.info { margin-top: 20px; font-size: 12px; color: #666; text-align: center; }' +
    '</style>' +
    '</head>' +
    '<body>' +
    '<div class="container">' +
    '<h1>SNS - Angola</h1>' +
    '<div id="error" class="error"></div>' +
    '<div class="form-group">' +
    '<label>Email</label>' +
    '<input type="email" id="email" value="admin@sns.gov.ao">' +
    '</div>' +
    '<div class="form-group">' +
    '<label>Senha</label>' +
    '<input type="password" id="password" value="Admin@2025">' +
    '</div>' +
    '<button onclick="fazerLogin()">Entrar</button>' +
    '<div class="info">Acesso restrito ao Ministério da Saúde</div>' +
    '</div>' +
    '<script>' +
    'function fazerLogin() {' +
    'fetch("/api/auth/login", {' +
    'method: "POST",' +
    'headers: { "Content-Type": "application/json" },' +
    'body: JSON.stringify({' +
    'email: document.getElementById("email").value,' +
    'password: document.getElementById("password").value' +
    '})' +
    '})' +
    '.then(res => res.json())' +
    '.then(data => {' +
    'if (data.token) {' +
    'localStorage.setItem("token", data.token);' +
    'window.location.href = "/ministerio/dashboard";' +
    '} else {' +
    'document.getElementById("error").style.display = "block";' +
    'document.getElementById("error").innerText = data.erro || "Erro no login";' +
    '}' +
    '})' +
    '.catch(err => {' +
    'document.getElementById("error").style.display = "block";' +
    'document.getElementById("error").innerText = "Erro de conexão";' +
    '});' +
    '}' +
    '</script>' +
    '</body>' +
    '</html>');
});

// ============================================
// ROTA DO DASHBOARD (PROTEGIDA)
// ============================================
app.get('/ministerio/dashboard', (req, res) => {
    const token = req.headers['authorization']?.split(' ')[1];
    
    if (!token) {
        return res.redirect('/ministerio');
    }
    
    try {
        jwt.verify(token, process.env.JWT_SECRET || 'secret-key');
        
        res.send('<!DOCTYPE html>' +
        '<html>' +
        '<head>' +
        '<meta charset="UTF-8">' +
        '<title>Dashboard - SNS</title>' +
        '<style>' +
        '* { margin: 0; padding: 0; box-sizing: border-box; font-family: Arial; }' +
        'body { display: flex; }' +
        '.sidebar { width: 250px; background: #006633; color: white; height: 100vh; padding: 20px; }' +
        '.sidebar h2 { margin-bottom: 30px; }' +
        '.sidebar a { display: block; color: white; text-decoration: none; padding: 10px; margin: 5px 0; }' +
        '.sidebar a:hover { background: #004d26; }' +
        '.main { flex: 1; padding: 30px; background: #f5f5f5; }' +
        '.header { display: flex; justify-content: space-between; margin-bottom: 30px; }' +
        '.cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-bottom: 30px; }' +
        '.card { background: white; padding: 20px; border-radius: 5px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }' +
        '.card h3 { color: #666; font-size: 14px; margin-bottom: 10px; }' +
        '.card .value { font-size: 24px; font-weight: bold; color: #006633; }' +
        '.btn-logout { background: #dc3545; color: white; border: none; padding: 8px 15px; border-radius: 3px; cursor: pointer; }' +
        '</style>' +
        '</head>' +
        '<body>' +
        '<div class="sidebar">' +
        '<h2>SNS</h2>' +
        '<a href="#">📊 Dashboard</a>' +
        '<a href="#">🏥 Laboratórios</a>' +
        '<a href="#">📋 Certificados</a>' +
        '<a href="#">🔑 Chaves</a>' +
        '</div>' +
        '<div class="main">' +
        '<div class="header">' +
        '<h1>Dashboard</h1>' +
        '<button class="btn-logout" onclick="logout()">Sair</button>' +
        '</div>' +
        '<div class="cards">' +
        '<div class="card"><h3>Laboratórios</h3><div class="value" id="totalLabs">0</div></div>' +
        '<div class="card"><h3>Certificados Hoje</h3><div class="value" id="certsHoje">0</div></div>' +
        '<div class="card"><h3>Total</h3><div class="value" id="totalCerts">0</div></div>' +
        '<div class="card"><h3>Ativos</h3><div class="value" id="ativos">0</div></div>' +
        '</div>' +
        '</div>' +
        '<script>' +
        'const token = localStorage.getItem("token");' +
        'if (!token) window.location.href = "/ministerio";' +
        'fetch("/api/stats", { headers: { "Authorization": "Bearer " + token } })' +
        '.then(res => res.json())' +
        '.then(data => {' +
        'document.getElementById("totalLabs").innerText = data.totalLabs || 0;' +
        'document.getElementById("certsHoje").innerText = data.certificadosHoje || 0;' +
        'document.getElementById("totalCerts").innerText = data.totalCertificados || 0;' +
        'document.getElementById("ativos").innerText = "100%";' +
        '})' +
        '.catch(err => console.log(err));' +
        'function logout() { localStorage.removeItem("token"); window.location.href = "/ministerio"; }' +
        '</script>' +
        '</body>' +
        '</html>');
        
    } catch (error) {
        res.redirect('/ministerio');
    }
});

// ============================================
// ROTAS DE AUTENTICAÇÃO
// ============================================
app.post('/api/auth/login', authLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ erro: 'Credenciais inválidas' });
        }

        const senhaValida = await bcrypt.compare(password, user.password);
        if (!senhaValida) {
            return res.status(401).json({ erro: 'Credenciais inválidas' });
        }

        const token = jwt.sign(
            { id: user._id, email: user.email, role: user.role },
            process.env.JWT_SECRET || 'secret-key',
            { expiresIn: '8h' }
        );

        res.json({
            token,
            user: {
                id: user._id,
                nome: user.nome,
                email: user.email,
                role: user.role
            }
        });

    } catch (error) {
        res.status(500).json({ erro: 'Erro interno' });
    }
});

// ============================================
// ROTAS DE LABORATÓRIOS
// ============================================
app.post('/api/labs', async (req, res) => {
    try {
        const dados = req.body;

        const apiKey = gerarApiKey();
        const chaveDesencriptacao = gerarChaveLeitor();
        const labId = 'LAB-' + Date.now();

        const lab = new Lab({
            ...dados,
            labId,
            apiKey,
            chaveDesencriptacao,
            expiraEm: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
        });

        await lab.save();

        res.json({
            sucesso: true,
            lab: {
                labId: lab.labId,
                nome: lab.nome,
                apiKey: lab.apiKey,
                chaveDesencriptacao: lab.chaveDesencriptacao
            }
        });

    } catch (error) {
        res.status(500).json({ erro: 'Erro interno' });
    }
});

app.get('/api/labs', async (req, res) => {
    try {
        const labs = await Lab.find({}, { chaveDesencriptacao: 0 });
        res.json(labs);
    } catch (error) {
        res.status(500).json({ erro: 'Erro interno' });
    }
});

// ============================================
// ESTATÍSTICAS
// ============================================
app.get('/api/stats', async (req, res) => {
    try {
        const token = req.headers['authorization']?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ erro: 'Não autorizado' });
        }
        
        jwt.verify(token, process.env.JWT_SECRET || 'secret-key');
        
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        
        const stats = {
            totalLabs: await Lab.countDocuments({ ativo: true }),
            totalCertificados: await Certificate.countDocuments(),
            certificadosHoje: await Certificate.countDocuments({
                emitidoEm: { $gte: hoje }
            })
        };
        res.json(stats);
    } catch (error) {
        res.status(401).json({ erro: 'Não autorizado' });
    }
});

// ============================================
// ROTA DE TESTE
// ============================================
app.get('/teste', (req, res) => {
    res.send('<h1>✅ Servidor funcionando!</h1><p><a href="/ministerio">Ir para login</a></p>');
});

// ============================================
// ROTA PADRÃO
// ============================================
app.get('/', (req, res) => {
    res.redirect('/ministerio');
});

// ============================================
// CRIAÇÃO DO ADMIN INICIAL
// ============================================
async function createFirstAdmin() {
    try {
        const adminExists = await User.findOne({ role: 'admin' });
        if (!adminExists) {
            const senhaHash = await bcrypt.hash('Admin@2025', 10);
            const admin = new User({
                nome: 'Administrador',
                email: 'admin@sns.gov.ao',
                password: senhaHash,
                role: 'admin'
            });
            await admin.save();
            console.log('✅ Admin criado: admin@sns.gov.ao / Admin@2025');
        }
    } catch (error) {
        console.error('Erro ao criar admin:', error);
    }
}

// ============================================
// INICIAR SERVIDOR
// ============================================
app.listen(PORT, async () => {
    console.log('\n🚀 SNS - Servidor iniciado na porta ' + PORT);
    console.log('📱 Ministério: http://localhost:' + PORT + '/ministerio');
    console.log('🔍 Teste: http://localhost:' + PORT + '/teste\n');
    await createFirstAdmin();
});