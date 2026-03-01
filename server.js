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

// Modelo de Utilizador do Ministério
const userSchema = new mongoose.Schema({
    nome: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['admin', 'inspetor'], default: 'admin' },
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

// Modelo de Log de Auditoria
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

function decifrarDados(dadosCifrados, chaveLeitor) {
    try {
        const [ivHex, encrypted] = dadosCifrados.split(':');
        const iv = Buffer.from(ivHex, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(chaveLeitor, 'hex'), iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return JSON.parse(decrypted);
    } catch (error) {
        throw new Error('Chave inválida');
    }
}

function gerarChaveLeitor() {
    return crypto.randomBytes(32).toString('hex');
}

function gerarApiKey() {
    return 'SNS-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

function gerarNumeroCertificado(tipo) {
    const ano = new Date().getFullYear();
    const mes = (new Date().getMonth() + 1).toString().padStart(2, '0');
    const random = crypto.randomBytes(3).toString('hex').toUpperCase();
    return 'CERT-' + tipo + '-' + ano + mes + '-' + random;
}

// ============================================
// ROTA PRINCIPAL - LOGIN
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
        .login-container {
            background: white;
            width: 100%;
            max-width: 400px;
            padding: 40px;
            border-radius: 10px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        }
        h1 {
            color: #006633;
            text-align: center;
            margin-bottom: 10px;
            font-size: 2rem;
        }
        .subtitle {
            text-align: center;
            color: #666;
            margin-bottom: 30px;
            font-size: 0.9rem;
        }
        .form-group {
            margin-bottom: 20px;
        }
        label {
            display: block;
            margin-bottom: 5px;
            color: #333;
            font-weight: 600;
        }
        input {
            width: 100%;
            padding: 12px;
            border: 1px solid #ddd;
            border-radius: 5px;
            font-size: 1rem;
        }
        input:focus {
            outline: none;
            border-color: #006633;
        }
        button {
            width: 100%;
            padding: 14px;
            background: #006633;
            color: white;
            border: none;
            border-radius: 5px;
            font-size: 1.1rem;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.3s;
        }
        button:hover {
            background: #004d26;
        }
        .error-message {
            background: #ffebee;
            color: #c62828;
            padding: 10px;
            border-radius: 5px;
            margin-bottom: 20px;
            display: none;
            text-align: center;
        }
        .info-box {
            margin-top: 30px;
            padding: 15px;
            background: #f5f5f5;
            border-radius: 5px;
            font-size: 0.85rem;
            color: #666;
            text-align: center;
        }
        .footer {
            text-align: center;
            margin-top: 30px;
            font-size: 0.8rem;
            color: #999;
        }
    </style>
</head>
<body>
    <div class="login-container">
        <h1>SNS</h1>
        <div class="subtitle">Sistema Nacional de Saúde - Angola</div>
        
        <div id="errorMessage" class="error-message"></div>
        
        <div class="form-group">
            <label>Email</label>
            <input type="email" id="email" value="admin@sns.gov.ao">
        </div>
        
        <div class="form-group">
            <label>Senha</label>
            <input type="password" id="password" value="Admin@2025">
        </div>
        
        <button onclick="login()">Entrar</button>
        
        <div class="info-box">
            <p><strong>Acesso restrito ao Ministério da Saúde</strong></p>
        </div>
        
        <div class="footer">
            © 2025 - Ministério da Saúde - Angola
        </div>
    </div>

    <script>
        function login() {
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const errorDiv = document.getElementById('errorMessage');
            
            errorDiv.style.display = 'none';
            
            fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password })
            })
            .then(response => response.json())
            .then(data => {
                if (data.token) {
                    localStorage.setItem('token', data.token);
                    window.location.href = '/ministerio/dashboard';
                } else {
                    errorDiv.style.display = 'block';
                    errorDiv.innerText = data.erro || 'Erro no login';
                }
            })
            .catch(error => {
                errorDiv.style.display = 'block';
                errorDiv.innerText = 'Erro de conexão com o servidor';
            });
        }

        document.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                login();
            }
        });
    </script>
</body>
</html>
    `);
});

// ============================================
// ROTA DO DASHBOARD (PROTEGIDA)
// ============================================
app.get('/ministerio/dashboard', (req, res) => {
    const token = req.headers['authorization']?.split(' ')[1] || req.query.token;
    
    if (!token) {
        return res.redirect('/ministerio');
    }
    
    try {
        jwt.verify(token, process.env.JWT_SECRET || 'secret-key');
        
        res.send(`
<!DOCTYPE html>
<html lang="pt">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dashboard - SNS</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }
        body {
            display: flex;
            background: #f5f5f5;
        }
        .sidebar {
            width: 250px;
            background: #006633;
            color: white;
            height: 100vh;
            position: fixed;
            padding: 20px;
        }
        .sidebar h2 {
            margin-bottom: 30px;
            font-size: 1.5rem;
        }
        .sidebar a {
            display: block;
            color: white;
            text-decoration: none;
            padding: 12px;
            margin: 5px 0;
            border-radius: 5px;
        }
        .sidebar a:hover {
            background: #004d26;
        }
        .main-content {
            margin-left: 250px;
            flex: 1;
            padding: 30px;
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 30px;
        }
        .header h1 {
            color: #333;
        }
        .logout-btn {
            background: #dc3545;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
        }
        .logout-btn:hover {
            background: #c82333;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .stat-card {
            background: white;
            padding: 20px;
            border-radius: 5px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
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
        .welcome-box {
            background: white;
            padding: 20px;
            border-radius: 5px;
            margin-top: 20px;
        }
    </style>
</head>
<body>
    <div class="sidebar">
        <h2>SNS</h2>
        <a href="#">📊 Dashboard</a>
        <a href="#">🏥 Laboratórios</a>
        <a href="#">📋 Certificados</a>
        <a href="#">🔑 Chaves API</a>
        <a href="#">⚙️ Configurações</a>
    </div>
    
    <div class="main-content">
        <div class="header">
            <h1>Dashboard</h1>
            <button class="logout-btn" onclick="logout()">Sair</button>
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
                <h3>Sistema</h3>
                <div class="value" id="status">Online</div>
            </div>
        </div>
        
        <div class="welcome-box">
            <h3>Bem-vindo ao SNS</h3>
            <p>Este é o painel de controle do Ministério da Saúde.</p>
        </div>
    </div>

    <script>
        const token = localStorage.getItem('token');
        
        if (!token) {
            window.location.href = '/ministerio';
        }
        
        function logout() {
            localStorage.removeItem('token');
            window.location.href = '/ministerio';
        }
        
        fetch('/api/stats', {
            headers: {
                'Authorization': 'Bearer ' + token
            }
        })
        .then(response => response.json())
        .then(data => {
            document.getElementById('totalLabs').innerText = data.totalLabs || 0;
            document.getElementById('certsHoje').innerText = data.certificadosHoje || 0;
            document.getElementById('totalCerts').innerText = data.totalCertificados || 0;
        })
        .catch(error => {
            console.log('Erro ao carregar stats:', error);
        });
    </script>
</body>
</html>
        `);
        
    } catch (error) {
        res.redirect('/ministerio');
    }
});

// ============================================
// ROTA DE AUTENTICAÇÃO
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
            return res.status(401).json({ erro: 'Usuário inativo' });
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
// ROTA DE ESTATÍSTICAS (PROTEGIDA)
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
// ROTA DE LABORATÓRIOS
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
                nome: 'Administrador SNS',
                email: 'admin@sns.gov.ao',
                password: senhaHash,
                role: 'admin'
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
    console.log('📡 Servidor: http://localhost:' + PORT);
    console.log('🏛️  Ministério: http://localhost:' + PORT + '/ministerio');
    console.log('🔍 Teste: http://localhost:' + PORT + '/teste');
    console.log('='.repeat(50) + '\n');
    
    await createFirstAdmin();
});