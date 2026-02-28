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
const BASE_URL = process.env.URL_BASE || 'http://localhost:3000';

// ============================================
// CONFIGURAÇÕES DE SEGURANÇA
// ============================================
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "https://api.sns.gov.ao", "http://localhost:3000"],
        },
    },
}));

// Configuração CORS
const corsOrigins = process.env.CORS_ORIGINS 
    ? process.env.CORS_ORIGINS.split(',') 
    : ['http://localhost:3000'];

app.use(cors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'x-leitor-key']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100,
    message: { erro: 'Muitas requisições. Tente novamente mais tarde.' }
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { erro: 'Muitas tentativas de login. Aguarde 15 minutos.' }
});

// ============================================
// CONEXÃO MONGODB
// ============================================
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sns-angola';

mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => console.log('✅ Conectado ao MongoDB - SNS Angola'))
.catch(err => {
    console.error('❌ Erro MongoDB:', err);
});

// ============================================
// ROTAS DE TESTE (PRIMEIRAS)
// ============================================

// Rota raiz
app.get('/', (req, res) => {
    res.redirect('/ministerio');
});

// Rota de teste simples
app.get('/teste', (req, res) => {
    res.send(`
        <h1>✅ SERVIDOR FUNCIONANDO!</h1>
        <p>Hora: ${new Date().toLocaleString()}</p>
        <p><a href="/ministerio">Ir para Ministério</a></p>
        <p><a href="/debug">Ver debug</a></p>
    `);
});

// Rota de debug
app.get('/debug', (req, res) => {
    const info = {
        servidor: 'online',
        timestamp: new Date().toISOString(),
        node_version: process.version,
        mongodb: mongoose.connection.readyState === 1 ? 'conectado' : 'desconectado',
        pasta_public: fs.existsSync(path.join(__dirname, 'public')) ? 'existe' : 'não existe',
        pasta_ministerio: fs.existsSync(path.join(__dirname, 'public/ministerio')) ? 'existe' : 'não existe',
        __dirname: __dirname
    };
    
    if (fs.existsSync(path.join(__dirname, 'public/ministerio'))) {
        try {
            info.arquivos = fs.readdirSync(path.join(__dirname, 'public/ministerio'));
        } catch (e) {
            info.erro_arquivos = e.message;
        }
    }
    
    res.json(info);
});

// Rota de status da API
app.get('/api/status', (req, res) => {
    res.json({ 
        status: 'online', 
        timestamp: new Date(),
        mongodb: mongoose.connection.readyState === 1 ? 'conectado' : 'desconectado',
        versao: '1.0.0'
    });
});

// ============================================
// ROTA PRINCIPAL DO MINISTÉRIO (SEM FICHEIROS)
// ============================================
app.get('/ministerio', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="pt">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SNS - Ministério da Saúde</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }
        body {
            background: linear-gradient(135deg, #006633 0%, #003300 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            color: white;
        }
        .container {
            max-width: 900px;
            width: 100%;
            background: rgba(255,255,255,0.1);
            backdrop-filter: blur(10px);
            border-radius: 30px;
            padding: 40px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            border: 1px solid rgba(255,255,255,0.2);
        }
        h1 {
            font-size: 3rem;
            margin-bottom: 10px;
            text-align: center;
        }
        h2 {
            font-size: 1.2rem;
            font-weight: 300;
            text-align: center;
            margin-bottom: 30px;
            opacity: 0.9;
        }
        .badge {
            background: #ffcc00;
            color: #003300;
            padding: 10px 25px;
            border-radius: 30px;
            font-weight: bold;
            display: inline-block;
            margin: 20px auto;
            text-align: center;
            width: fit-content;
        }
        .stats {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 20px;
            margin: 40px 0;
        }
        .stat-card {
            background: rgba(255,255,255,0.15);
            padding: 25px;
            border-radius: 15px;
            text-align: center;
            transition: transform 0.3s;
        }
        .stat-card:hover {
            transform: translateY(-5px);
            background: rgba(255,255,255,0.2);
        }
        .stat-icon {
            font-size: 2.5rem;
            margin-bottom: 10px;
        }
        .stat-value {
            font-size: 2rem;
            font-weight: bold;
            color: #ffcc00;
        }
        .stat-label {
            font-size: 0.9rem;
            opacity: 0.9;
            margin-top: 5px;
        }
        .features {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 20px;
            margin: 40px 0;
        }
        .feature {
            background: rgba(255,255,255,0.1);
            padding: 20px;
            border-radius: 15px;
            border: 1px solid rgba(255,255,255,0.1);
        }
        .feature h3 {
            margin-bottom: 10px;
            color: #ffcc00;
        }
        .feature p {
            opacity: 0.8;
            line-height: 1.6;
        }
        .login-form {
            background: rgba(255,255,255,0.1);
            padding: 30px;
            border-radius: 15px;
            margin: 30px 0;
        }
        .form-group {
            margin-bottom: 20px;
        }
        .form-group label {
            display: block;
            margin-bottom: 8px;
            font-weight: 600;
        }
        .form-group input {
            width: 100%;
            padding: 12px 15px;
            border: none;
            border-radius: 8px;
            font-size: 1rem;
            background: rgba(255,255,255,0.9);
        }
        .form-group input:focus {
            outline: 2px solid #ffcc00;
        }
        .btn-login {
            background: #ffcc00;
            color: #003300;
            border: none;
            padding: 15px 30px;
            border-radius: 8px;
            font-size: 1.1rem;
            font-weight: bold;
            cursor: pointer;
            width: 100%;
            transition: all 0.3s;
        }
        .btn-login:hover {
            background: #ffd700;
            transform: translateY(-2px);
            box-shadow: 0 10px 20px rgba(0,0,0,0.2);
        }
        .footer {
            text-align: center;
            margin-top: 30px;
            font-size: 0.8rem;
            opacity: 0.7;
            border-top: 1px solid rgba(255,255,255,0.1);
            padding-top: 20px;
        }
        .links {
            display: flex;
            gap: 20px;
            justify-content: center;
            margin: 20px 0;
        }
        .links a {
            color: white;
            text-decoration: none;
            opacity: 0.8;
        }
        .links a:hover {
            opacity: 1;
            text-decoration: underline;
        }
        @media (max-width: 600px) {
            .stats { grid-template-columns: repeat(2, 1fr); }
            .features { grid-template-columns: 1fr; }
            h1 { font-size: 2rem; }
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🏥 SNS</h1>
        <h2>Sistema Nacional de Saúde - Angola</h2>
        
        <div class="badge">✅ Servidor Online</div>
        
        <div class="stats">
            <div class="stat-card">
                <div class="stat-icon">🏥</div>
                <div class="stat-value" id="totalLabs">47</div>
                <div class="stat-label">Laboratórios</div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">📋</div>
                <div class="stat-value" id="totalCerts">15.234</div>
                <div class="stat-label">Certificados</div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">✅</div>
                <div class="stat-value" id="certsHoje">89</div>
                <div class="stat-label">Hoje</div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">🔐</div>
                <div class="stat-value" id="ativos">100%</div>
                <div class="stat-label">Ativo</div>
            </div>
        </div>

        <div class="features">
            <div class="feature">
                <h3>🏥 Laboratórios</h3>
                <p>Gestão completa de todos os laboratórios do país</p>
            </div>
            <div class="feature">
                <h3>📊 Certificados</h3>
                <p>Emissão e verificação de certificados médicos</p>
            </div>
            <div class="feature">
                <h3>🔑 Chaves API</h3>
                <p>Atribuição e gestão de chaves de acesso</p>
            </div>
            <div class="feature">
                <h3>📈 Estatísticas</h3>
                <p>Relatórios e indicadores em tempo real</p>
            </div>
        </div>

        <div class="login-form">
            <h3 style="margin-bottom: 20px;">🔐 Acesso ao Portal</h3>
            <div class="form-group">
                <label>Email</label>
                <input type="email" id="email" placeholder="admin@sns.gov.ao" value="admin@sns.gov.ao">
            </div>
            <div class="form-group">
                <label>Senha</label>
                <input type="password" id="password" placeholder="••••••••" value="Admin@2025">
            </div>
            <button class="btn-login" onclick="login()">Entrar no Sistema</button>
        </div>

        <div class="links">
            <a href="/teste">Teste</a>
            <a href="/debug">Debug</a>
            <a href="/api/status">API Status</a>
        </div>

        <div class="footer">
            Ministério da Saúde - República de Angola<br>
            Versão 1.0 • 2025
        </div>
    </div>

    <script>
        async function carregarStats() {
            try {
                const response = await fetch('/api/stats');
                const data = await response.json();
                if (data.totalLabs) document.getElementById('totalLabs').textContent = data.totalLabs;
                if (data.totalCertificados) document.getElementById('totalCerts').textContent = data.totalCertificados.toLocaleString();
                if (data.certificadosHoje) document.getElementById('certsHoje').textContent = data.certificadosHoje;
            } catch (e) {
                console.log('Usando dados mock');
            }
        }

        function login() {
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            
            if (email === 'admin@sns.gov.ao' && password === 'Admin@2025') {
                alert('✅ Login bem-sucedido! Redirecionando...');
                window.location.href = '/ministerio/dashboard';
            } else {
                alert('❌ Credenciais inválidas. Use: admin@sns.gov.ao / Admin@2025');
            }
        }

        carregarStats();
    </script>
</body>
</html>
    `);
});

// Rota do dashboard (após login)
app.get('/ministerio/dashboard', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="pt">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dashboard - SNS Angola</title>
    <style>
        body {
            margin: 0;
            font-family: 'Segoe UI', sans-serif;
            background: #f0f2f5;
            display: flex;
        }
        .sidebar {
            width: 280px;
            background: linear-gradient(180deg, #006633, #003300);
            color: white;
            height: 100vh;
            position: fixed;
            left: 0;
            top: 0;
        }
        .sidebar .logo {
            padding: 30px 20px;
            text-align: center;
            border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        .sidebar nav a {
            display: block;
            padding: 15px 25px;
            color: rgba(255,255,255,0.8);
            text-decoration: none;
            border-left: 4px solid transparent;
        }
        .sidebar nav a:hover,
        .sidebar nav a.active {
            background: rgba(255,255,255,0.1);
            color: white;
            border-left-color: #ffcc00;
        }
        .sidebar .user-info {
            padding: 20px;
            border-top: 1px solid rgba(255,255,255,0.1);
            position: absolute;
            bottom: 0;
            width: 100%;
        }
        .main-content {
            margin-left: 280px;
            padding: 30px;
            flex: 1;
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 30px;
        }
        .cards {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .card {
            background: white;
            padding: 25px;
            border-radius: 15px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.1);
        }
        .card h3 {
            color: #666;
            font-size: 0.9rem;
            margin-bottom: 10px;
        }
        .card .value {
            font-size: 2rem;
            font-weight: bold;
            color: #006633;
        }
        .btn-logout {
            background: #dc3545;
            color: white;
            border: none;
            padding: 8px 15px;
            border-radius: 5px;
            cursor: pointer;
            width: 100%;
        }
        .btn-voltar {
            background: #6c757d;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            text-decoration: none;
            display: inline-block;
        }
    </style>
</head>
<body>
    <div class="sidebar">
        <div class="logo">
            <h1>SNS</h1>
            <p>Ministério da Saúde</p>
        </div>
        <nav>
            <a href="#" class="active">📊 Dashboard</a>
            <a href="#">🏥 Laboratórios</a>
            <a href="#">📋 Certificados</a>
            <a href="#">🔑 Chaves</a>
            <a href="#">📈 Relatórios</a>
        </nav>
        <div class="user-info">
            <p>👤 Administrador</p>
            <button class="btn-logout" onclick="logout()">Sair</button>
        </div>
    </div>
    
    <div class="main-content">
        <div class="header">
            <h1>Dashboard</h1>
            <a href="/ministerio" class="btn-voltar">← Voltar</a>
        </div>
        
        <div class="cards">
            <div class="card">
                <h3>Laboratórios</h3>
                <div class="value">47</div>
            </div>
            <div class="card">
                <h3>Certificados Hoje</h3>
                <div class="value">89</div>
            </div>
            <div class="card">
                <h3>Total</h3>
                <div class="value">15.234</div>
            </div>
            <div class="card">
                <h3>Ativos</h3>
                <div class="value">100%</div>
            </div>
        </div>
        
        <p style="color: #666; margin-top: 20px;">Bem-vindo ao painel de administração do SNS.</p>
    </div>

    <script>
        function logout() {
            if (confirm('Tem certeza?')) {
                window.location.href = '/ministerio';
            }
        }
    </script>
</body>
</html>
    `);
});

// ============================================
// MODELOS DE DADOS
// ============================================

// Modelo de Laboratório/Instituição
const labSchema = new mongoose.Schema({
    labId: { type: String, required: true, unique: true },
    nome: { type: String, required: true },
    tipo: { 
        type: String, 
        enum: ['laboratorio', 'hospital', 'clinica', 'seguradora', 'ministerio', 'genlove', 'empresa'],
        required: true 
    },
    provincia: { type: String, required: true },
    municipio: String,
    endereco: String,
    email: String,
    telefone: String,
    diretor: String,
    
    apiKey: { type: String, unique: true },
    apiSecret: String,
    chaveDesencriptacao: { type: String, unique: true },
    
    permissoes: {
        tiposCertificado: { type: [Number], default: [] },
        camposVisiveis: { type: [String], default: [] },
        formatoEspecial: { type: String, default: 'completo' }
    },
    
    ativo: { type: Boolean, default: true },
    emitidoEm: { type: Date, default: Date.now },
    expiraEm: { type: Date, default: () => new Date(+new Date() + 365*24*60*60*1000) },
    ultimoAcesso: Date,
    
    totalEmissoes: { type: Number, default: 0 },
    totalConsultas: { type: Number, default: 0 },
    
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

// Modelo de Utilizador do Ministério
const userSchema = new mongoose.Schema({
    nome: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { 
        type: String, 
        enum: ['admin', 'inspetor', 'estatistico', 'suporte'],
        default: 'estatistico'
    },
    permissoes: [{ type: String }],
    ativo: { type: Boolean, default: true },
    ultimoLogin: Date,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

// Modelo de Certificado
const certificateSchema = new mongoose.Schema({
    numero: { type: String, required: true, unique: true },
    tipo: { type: Number, required: true, enum: [1, 2, 3, 4, 5] },
    
    paciente: {
        nomeCompleto: { type: String, required: true },
        prenome: String,
        sobrenome: String,
        genero: { type: String, enum: ['M', 'F'] },
        dataNascimento: Date,
        bi: String,
        nif: String,
        telefone: String,
        provincia: String,
        municipio: String
    },
    
    dados: {
        genotipo: { type: String, enum: ['AA', 'AS', 'SS'] },
        grupoSanguineo: String,
        hemoglobina: Number,
        
        avaliacao: String,
        finalidade: [String],
        doencasInfecciosas: [String],
        
        periodoInicio: Date,
        periodoFim: Date,
        diasIncapacidade: Number,
        recomendacoes: [String],
        cid: String,
        
        tipoAptidao: String,
        funcao: String,
        examesRealizados: [String],
        restricoes: [String],
        
        obstetricos: {
            gestacoes: Number,
            partos: Number,
            cesarianas: Number,
            abortos: Number
        },
        gravidezAtual: {
            dpp: Date,
            ig: Number,
            consultas: Number
        },
        prevencao: {
            fansidar: [Date],
            vacinaTetano: [Date],
            ferro: Boolean,
            mosquiteiro: Boolean
        },
        exames: mongoose.Schema.Types.Mixed
    },
    
    dadosGenlove: String,
    
    qrCodeData: String,
    qrCodeImage: String,
    hashVerificacao: { type: String, unique: true },
    
    emitidoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Lab' },
    tecnico: String,
    diretor: String,
    emitidoEm: { type: Date, default: Date.now },
    validoAte: Date,
    
    observacoes: String
}, { timestamps: true });

// Modelo de Log de Auditoria
const auditLogSchema = new mongoose.Schema({
    timestamp: { type: Date, default: Date.now },
    acao: { 
        type: String, 
        enum: ['EMISSAO', 'CONSULTA', 'VERIFICACAO', 'CRIACAO_LAB', 'ALTERACAO_LAB', 'LOGIN', 'LOGOUT', 'REVOGACAO']
    },
    labId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lab' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    certificadoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Certificate' },
    tipoCertificado: Number,
    ip: String,
    userAgent: String,
    detalhes: mongoose.Schema.Types.Mixed,
    sucesso: { type: Boolean, default: true },
    erro: String
});

// Índices
labSchema.index({ apiKey: 1 });
labSchema.index({ chaveDesencriptacao: 1 });
certificateSchema.index({ numero: 1 });
certificateSchema.index({ hashVerificacao: 1 });
certificateSchema.index({ emitidoEm: -1 });
auditLogSchema.index({ timestamp: -1 });

const Lab = mongoose.model('Lab', labSchema);
const User = mongoose.model('User', userSchema);
const Certificate = mongoose.model('Certificate', certificateSchema);
const AuditLog = mongoose.model('AuditLog', auditLogSchema);

// ============================================
// UTILITÁRIOS DE CRIPTOGRAFIA
// ============================================
const MASTER_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');

function cifrarDados(dados) {
    try {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(MASTER_KEY, 'hex'), iv);
        let encrypted = cipher.update(JSON.stringify(dados), 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return iv.toString('hex') + ':' + encrypted;
    } catch (error) {
        throw new Error('Erro ao cifrar dados: ' + error.message);
    }
}

function decifrarDados(dadosCifrados, chaveLeitor) {
    try {
        const [ivHex, encrypted] = dadosCifrados.split(':');
        const iv = Buffer.from(ivHex, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(chaveLeitor, 'hex'), iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return JSON.parse(decrypted);
    } catch (error) {
        throw new Error('Chave inválida ou dados corrompidos');
    }
}

function gerarChaveLeitor() {
    return crypto.randomBytes(32).toString('hex');
}

function gerarApiKey() {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(4).toString('hex').toUpperCase();
    return `SNS-${timestamp}-${random}`;
}

function gerarNumeroCertificado(tipo) {
    const ano = new Date().getFullYear();
    const mes = (new Date().getMonth() + 1).toString().padStart(2, '0');
    const random = crypto.randomBytes(3).toString('hex').toUpperCase();
    return `CERT-${tipo}-${ano}${mes}-${random}`;
}

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

        if (!user.ativo) {
            return res.status(401).json({ erro: 'Utilizador inativo' });
        }

        user.ultimoLogin = new Date();
        await user.save();

        const token = jwt.sign(
            { id: user._id, email: user.email, role: user.role },
            process.env.JWT_SECRET || 'secret-key',
            { expiresIn: process.env.JWT_EXPIRE || '8h' }
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

        if (!dados.nome || !dados.tipo || !dados.provincia) {
            return res.status(400).json({ 
                erro: 'Nome, tipo e província são obrigatórios' 
            });
        }

        const apiKey = gerarApiKey();
        const chaveDesencriptacao = gerarChaveLeitor();
        const labId = `LAB-${Date.now()}`;

        const lab = new Lab({
            ...dados,
            labId,
            apiKey,
            chaveDesencriptacao
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
        const labs = await Lab.find({}, { apiSecret: 0, chaveDesencriptacao: 0 });
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
        const stats = {
            totalLabs: await Lab.countDocuments({ ativo: true }),
            labsInativos: await Lab.countDocuments({ ativo: false }),
            totalCertificados: await Certificate.countDocuments(),
            certificadosHoje: await Certificate.countDocuments({
                emitidoEm: { $gte: new Date(new Date().setHours(0,0,0,0)) }
            })
        };
        res.json(stats);
    } catch (error) {
        res.status(500).json({ erro: 'Erro interno' });
    }
});

// ============================================
// FALLBACK PARA ROTAS NÃO ENCONTRADAS
// ============================================
app.use('*', (req, res) => {
    res.status(404).send(`
        <h1>404 - Página não encontrada</h1>
        <p>A rota <strong>${req.originalUrl}</strong> não existe.</p>
        <p><a href="/ministerio">Voltar para o início</a></p>
    `);
});

// ============================================
// INICIAR SERVIDOR
// ============================================
app.listen(PORT, async () => {
    console.log('\n' + '='.repeat(50));
    console.log('🚀 SNS - SISTEMA NACIONAL DE SAÚDE');
    console.log('='.repeat(50));
    console.log(`📡 Servidor: http://localhost:${PORT}`);
    console.log(`🏛️  Ministério: http://localhost:${PORT}/ministerio`);
    console.log(`🔍 Teste: http://localhost:${PORT}/teste`);
    console.log(`📊 Debug: http://localhost:${PORT}/debug`);
    console.log('='.repeat(50) + '\n');

    // Criar admin se não existir
    const adminExists = await User.findOne({ role: 'admin' });
    if (!adminExists) {
        const senhaHash = await bcrypt.hash('Admin@2025', 10);
        const admin = new User({
            nome: 'Administrador SNS',
            email: 'admin@sns.gov.ao',
            password: senhaHash,
            role: 'admin',
            permissoes: ['*']
        });
        await admin.save();
        console.log('✅ Administrador criado: admin@sns.gov.ao / Admin@2025');
    }
});