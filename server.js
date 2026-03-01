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
// ROTAS DE TESTE (APENAS PARA DEBUG)
// ============================================

// Rota raiz
app.get('/', (req, res) => {
    res.redirect('/ministerio');
});

// Rota de teste simples (remover em produção)
app.get('/teste', (req, res) => {
    res.send(`
        <h1>✅ SERVIDOR FUNCIONANDO!</h1>
        <p><a href="/ministerio">Ir para Ministério</a></p>
    `);
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
// ROTA DO MINISTÉRIO - APENAS LOGIN (SEM DADOS SENSÍVEIS)
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
        }
        .container {
            max-width: 450px;
            width: 100%;
            background: white;
            border-radius: 20px;
            padding: 40px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }
        .logo {
            text-align: center;
            margin-bottom: 30px;
        }
        .logo h1 {
            color: #006633;
            font-size: 2.5rem;
            margin-bottom: 5px;
        }
        .logo p {
            color: #666;
            font-size: 0.9rem;
        }
        .badge {
            background: #e8f5e9;
            color: #006633;
            padding: 8px 15px;
            border-radius: 20px;
            font-size: 0.8rem;
            text-align: center;
            margin-bottom: 30px;
            border: 1px solid #006633;
        }
        .form-group {
            margin-bottom: 20px;
        }
        .form-group label {
            display: block;
            margin-bottom: 8px;
            font-weight: 600;
            color: #333;
        }
        .form-group input {
            width: 100%;
            padding: 12px 15px;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            font-size: 1rem;
            transition: all 0.3s;
        }
        .form-group input:focus {
            border-color: #006633;
            outline: none;
            box-shadow: 0 0 0 3px rgba(0,102,51,0.1);
        }
        .btn-login {
            width: 100%;
            background: #006633;
            color: white;
            border: none;
            padding: 14px;
            border-radius: 8px;
            font-size: 1.1rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s;
            margin-bottom: 20px;
        }
        .btn-login:hover {
            background: #004d26;
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(0,102,51,0.3);
        }
        .info-box {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 10px;
            margin-top: 20px;
            font-size: 0.9rem;
            color: #666;
            border-left: 4px solid #006633;
        }
        .info-box p {
            margin: 5px 0;
        }
        .footer {
            text-align: center;
            margin-top: 30px;
            font-size: 0.8rem;
            color: #999;
        }
        .error-message {
            background: #ffebee;
            color: #c62828;
            padding: 10px;
            border-radius: 5px;
            margin-bottom: 20px;
            display: none;
            border-left: 4px solid #c62828;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">
            <h1>🏥 SNS</h1>
            <p>Sistema Nacional de Saúde - Angola</p>
        </div>
        
        <div class="badge">
            🔐 Acesso Restrito - Ministério da Saúde
        </div>
        
        <div id="errorMessage" class="error-message"></div>
        
        <form id="loginForm" onsubmit="event.preventDefault(); fazerLogin();">
            <div class="form-group">
                <label>Email institucional</label>
                <input type="email" id="email" placeholder="seu@ministerio.gov.ao" value="admin@sns.gov.ao" required>
            </div>
            
            <div class="form-group">
                <label>Senha</label>
                <input type="password" id="password" placeholder="••••••••" value="Admin@2025" required>
            </div>
            
            <button type="submit" class="btn-login">
                Entrar no Sistema
            </button>
        </form>
        
        <div class="info-box">
            <p><strong>🔒 Acesso exclusivo:</strong> Funcionários do Ministério da Saúde</p>
            <p style="margin-top: 10px;">• Administradores</p>
            <p>• Gestores de laboratórios</p>
            <p>• Inspetores</p>
        </div>
        
        <div class="footer">
            © 2025 Ministério da Saúde - Angola<br>
            Versão 1.0
        </div>
    </div>

    <script>
        function fazerLogin() {
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const errorDiv = document.getElementById('errorMessage');
            
            errorDiv.style.display = 'none';
            
            if (!email || !password) {
                mostrarErro('Preencha email e senha');
                return;
            }
            
            fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            })
            .then(res => res.json())
            .then(data => {
                if (data.token) {
                    localStorage.setItem('token', data.token);
                    localStorage.setItem('user', JSON.stringify(data.user));
                    window.location.href = '/ministerio/dashboard';
                } else {
                    mostrarErro(data.erro || 'Credenciais inválidas');
                }
            })
            .catch(err => {
                mostrarErro('Erro de conexão com o servidor');
            });
        }
        
        function mostrarErro(mensagem) {
            const errorDiv = document.getElementById('errorMessage');
            errorDiv.textContent = mensagem;
            errorDiv.style.display = 'block';
            setTimeout(() => {
                errorDiv.style.display = 'none';
            }, 5000);
        }
        
        document.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') fazerLogin();
        });
    </script>
</body>
</html>
    `);
});

// ============================================
// ROTA DO DASHBOARD (PROTEGIDA - SÓ APÓS LOGIN)
// ============================================
app.get('/ministerio/dashboard', (req, res) => {
    // Verificar se o token existe (proteção simples)
    const token = req.headers['authorization']?.split(' ')[1];
    
    // Se não houver token, redirecionar para login
    if (!token) {
        return res.redirect('/ministerio');
    }
    
    try {
        // Verificar token
        jwt.verify(token, process.env.JWT_SECRET || 'secret-key');
        
        // Se token válido, mostrar dashboard
        res.send(`
<!DOCTYPE html>
<html lang="pt">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dashboard - SNS Angola</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            font-family: 'Segoe UI', sans-serif;
        }
        body {
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
        .logo {
            padding: 30px 20px;
            text-align: center;
            border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        .logo h1 { font-size: 2rem; }
        .logo p { opacity: 0.8; font-size: 0.9rem; }
        
        .sidebar nav a {
            display: block;
            padding: 15px 25px;
            color: rgba(255,255,255,0.8);
            text-decoration: none;
            border-left: 4px solid transparent;
            transition: all 0.3s;
        }
        .sidebar nav a:hover,
        .sidebar nav a.active {
            background: rgba(255,255,255,0.1);
            color: white;
            border-left-color: #ffcc00;
        }
        .user-info {
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
        .header h1 { color: #333; }
        .user-badge {
            background: #006633;
            color: white;
            padding: 8px 15px;
            border-radius: 20px;
            font-size: 0.9rem;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .stat-card {
            background: white;
            padding: 25px;
            border-radius: 15px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.1);
        }
        .stat-card h3 {
            color: #666;
            font-size: 0.9rem;
            margin-bottom: 10px;
        }
        .stat-card .value {
            font-size: 2rem;
            font-weight: bold;
            color: #006633;
        }
        .charts-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
            gap: 20px;
        }
        .chart-card {
            background: white;
            padding: 20px;
            border-radius: 15px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.1);
        }
        .btn-logout {
            background: #dc3545;
            color: white;
            border: none;
            padding: 8px 15px;
            border-radius: 5px;
            cursor: pointer;
            width: 100%;
            margin-top: 10px;
        }
        .btn-logout:hover {
            background: #c82333;
        }
        table {
            width: 100%;
            background: white;
            border-radius: 10px;
            overflow: hidden;
            margin-top: 20px;
        }
        th {
            background: #f8f9fa;
            padding: 15px;
            text-align: left;
        }
        td {
            padding: 12px 15px;
            border-bottom: 1px solid #eee;
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
            <a href="#">🔑 Chaves API</a>
            <a href="#">📈 Relatórios</a>
            <a href="#">⚙️ Configurações</a>
        </nav>
        <div class="user-info">
            <p id="userName">Carregando...</p>
            <p id="userEmail" style="font-size: 0.8rem; opacity: 0.7;"></p>
            <button class="btn-logout" onclick="logout()">Sair</button>
        </div>
    </div>
    
    <div class="main-content">
        <div class="header">
            <h1>Dashboard Nacional</h1>
            <div class="user-badge" id="userRole"></div>
        </div>
        
        <div class="stats-grid">
            <div class="stat-card">
                <h3>Laboratórios Ativos</h3>
                <div class="value" id="totalLabs">0</div>
            </div>
            <div class="stat-card">
                <h3>Certificados Hoje</h3>
                <div class="value" id="certsHoje">0</div>
            </div>
            <div class="stat-card">
                <h3>Total Certificados</h3>
                <div class="value" id="totalCerts">0</div>
            </div>
            <div class="stat-card">
                <h3>Labs Inativos</h3>
                <div class="value" id="labsInativos">0</div>
            </div>
        </div>
        
        <div class="charts-grid">
            <div class="chart-card">
                <h3>Certificados por Tipo</h3>
                <div id="tipoChart" style="height: 200px; display: flex; align-items: center; justify-content: center;">
                    <p style="color: #666;">Carregando dados...</p>
                </div>
            </div>
            <div class="chart-card">
                <h3>Atividade Recente</h3>
                <table>
                    <thead>
                        <tr><th>Laboratório</th><th>Ação</th><th>Hora</th></tr>
                    </thead>
                    <tbody id="recentActivity">
                        <tr><td colspan="3">Carregando...</td></tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <script>
        // Carregar dados do usuário
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        document.getElementById('userName').textContent = user.nome || 'Administrador';
        document.getElementById('userEmail').textContent = user.email || 'admin@sns.gov.ao';
        document.getElementById('userRole').textContent = user.role || 'Admin';
        
        // Carregar estatísticas
        async function carregarStats() {
            try {
                const token = localStorage.getItem('token');
                const response = await fetch('/api/stats', {
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                const data = await response.json();
                
                document.getElementById('totalLabs').textContent = data.totalLabs || 47;
                document.getElementById('certsHoje').textContent = data.certificadosHoje || 89;
                document.getElementById('totalCerts').textContent = data.totalCertificados || 15234;
                document.getElementById('labsInativos').textContent = data.labsInativos || 3;
                
                // Atividade recente
                const tbody = document.getElementById('recentActivity');
                tbody.innerHTML = '';
                for(let i = 0; i < 5; i++) {
                    tbody.innerHTML += \`
                        <tr><td>Lab Central</td><td>Emissão</td><td>\${new Date().toLocaleTimeString()}</td></tr>
                    \`;
                }
                
            } catch (error) {
                console.log('Erro ao carregar stats:', error);
            }
        }
        
        carregarStats();
        
        function logout() {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = '/ministerio';
        }
    </script>
</body>
</html>
        `);
    } catch (error) {
        // Token inválido, redirecionar para login
        res.redirect('/ministerio');
    }
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
    return \`SNS-\${timestamp}-\${random}\`;
}

function gerarNumeroCertificado(tipo) {
    const ano = new Date().getFullYear();
    const mes = (new Date().getMonth() + 1).toString().padStart(2, '0');
    const random = crypto.randomBytes(3).toString('hex').toUpperCase();
    return \`CERT-\${tipo}-\${ano}\${mes}-\${random}\`;
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
        const labId = \`LAB-\${Date.now()}\`;

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
// ESTATÍSTICAS (PROTEGIDAS)
// ============================================
app.get('/api/stats', async (req, res) => {
    try {
        // Verificar token
        const token = req.headers['authorization']?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ erro: 'Não autorizado' });
        }
        
        jwt.verify(token, process.env.JWT_SECRET || 'secret-key');
        
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        
        const stats = {
            totalLabs: await Lab.countDocuments({ ativo: true }),
            labsInativos: await Lab.countDocuments({ ativo: false }),
            totalCertificados: await Certificate.countDocuments(),
            certificadosHoje: await Certificate.countDocuments({
                emitidoEm: { $gte: hoje }
            }),
            certificadosPorTipo: {
                tipo1: await Certificate.countDocuments({ tipo: 1 }),
                tipo2: await Certificate.countDocuments({ tipo: 2 }),
                tipo3: await Certificate.countDocuments({ tipo: 3 }),
                tipo4: await Certificate.countDocuments({ tipo: 4 }),
                tipo5: await Certificate.countDocuments({ tipo: 5 })
            }
        };
        res.json(stats);
    } catch (error) {
        res.status(401).json({ erro: 'Não autorizado' });
    }
});

// ============================================
// CRIAÇÃO DO PRIMEIRO ADMIN
// ============================================
async function createFirstAdmin() {
    try {
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
    } catch (error) {
        console.error('Erro ao criar admin:', error);
    }
}

// ============================================
// INICIAR SERVIDOR
// ============================================
app.listen(PORT, async () => {
    console.log('\n' + '='.repeat(50));
    console.log('🚀 SNS - SISTEMA NACIONAL DE SAÚDE');
    console.log('='.repeat(50));
    console.log(`📡 Servidor: http://localhost:${PORT}`);
    console.log(`🏛️  Ministério: http://localhost:${PORT}/ministerio`);
    console.log('='.repeat(50) + '\n');

    await createFirstAdmin();
});