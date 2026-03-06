// =======================
// SNS - SISTEMA NACIONAL DE SAÚDE
// MINISTÉRIO DA SAÚDE - ANGOLA
// VERSÃO FINAL CORRIGIDA - LABORATÓRIOS VISÍVEIS
// =======================

const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const crypto = require('crypto');
const PDFDocument = require('pdfkit');
const path = require('path');
const QRCode = require('qrcode');
require('dotenv').config();
const app = express();
const PORT = process.env.PORT || 3000;

// =======================
// CONFIGURAÇÕES
// =======================
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('public'));

// =======================
// CONEXÃO MONGODB
// =======================
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sns';
mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ MongoDB connectado'))
    .catch(err => console.log('❌ MongoDB erro: ', err));

// =======================
// FUNÇÕES AUXILIARES
// =======================
function gerarApiKey() {
    return 'SNS-' + Date.now() + '-' + crypto.randomBytes(8).toString('hex').toUpperCase();
}

function gerarChaveAcesso(tipo) {
    const prefixo = tipo === 'hospital' ? 'HOSP' : 'EMP';
    return prefixo + '-' + Date.now() + '-' + crypto.randomBytes(6).toString('hex').toUpperCase();
}

function validatorNIF(nif) {
    return /^d{10}$/.test(nif);
}

function gerarNumeroCertificado(tipo) {
    const ano = new Date().getFullYear();
    const mes = (new Date().getMonth() + 1).toString().padStart(2, '0');
    const dia = new Date().getDate().toString().padStart(2, '0');
    const random = crypto.randomBytes(4).toString('hex').toUpperCase();
    const prefixos = {
        1: 'GEN', 2: 'SAU', 3: 'INC', 
        4: 'APT', 5: 'MAT', 6: 'CPN', 
        7: 'EPI', 8: 'CSD'
    };
    const sequencia = String(Math.floor(1000 + Math.random() * 9000));
    return `${prefixos[tipo]}-${ano}${mes}${dia}-${sequencia}-${random}`;
}

// =======================
// MODELOS DE DADOS
// =======================
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
    tipo: { type: String, enum: ['Público', 'Privado', 'Misto'], required: true },
    provincia: { type: String, required: true },
    municipio: String,
    endereco: { type: String, required: true },
    telefone: { type: String, required: true },
    telefone2: String,
    email: { type: String, required: true },
    website: String,
    diretor: { type: String, required: true },
    responsavelTecnico: String,
    licenca: String,
    validadeLicenca: Date,
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
    telefone: String,
    email: String,
    diretor: String,
    ativo: { type: Boolean, default: true }
});

const empresaSchema = new mongoose.Schema({
    nome: { type: String, required: true },
    nif: { type: String, unique: true, required: true },
    provincia: { type: String, required: true },
    endereco: String,
    telefone: String,
    email: String,
    responsavel: String,
    ativo: { type: Boolean, default: true }
});

const certificateSchema = new mongoose.Schema({
    numero: { type: String, unique: true },
    tipo: Number,
    paciente: {
        nomeCompleto: String,
        bi: String,
        dataNascimento: Date,
        genero: String,
        telefone: String
    },
    laborantin: {
        nome: String,
        registro: String
    },
    dados: mongoose.Schema.Types.Mixed,
    imc: Number,
    idade: Number,
    classificacaoIMC: String,
    hash: { type: String, unique: true },
    emitidoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Lab' },
    emitidoEm: { type: Date, default: Date.now }
});

certificateSchema.pre('save', function(next) {
    if (this.paciente && this.paciente.dataNascimento) {
        const hoje = new Date();
        const nascimento = new Date(this.paciente.dataNascimento);
        let idade = hoje.getFullYear() - nascimento.getFullYear();
        const mes = hoje.getMonth() - nascimento.getMonth();
        if (mes < 0 || (mes === 0 && hoje.getDate() < nascimento.getDate())) {
            idade--;
        }
        this.idade = idade;
    }

    if (this.dados && this.dados.peso && this.dados.altura) {
        const peso = parseFloat(this.dados.peso);
        const altura = parseFloat(this.dados.altura);
        if (peso && altura && altura > 0) {
            this.imc = parseFloat((peso / (altura * altura)).toFixed(2));
            if (this.imc < 18.5) this.classificacaoIMC = "Abaixo do peso";
            else if (this.imc < 25) this.classificacaoIMC = "Peso normal";
            else if (this.imc < 30) this.classificacaoIMC = "Sobrepeso";
            else this.classificacaoIMC = "Obesidade";
        }
    }
    next();
});

const User = mongoose.model('User', userSchema);
const Lab = mongoose.model('Lab', labSchema);
const Hospital = mongoose.model('Hospital', hospitalSchema);
const Empresa = mongoose.model('Empresa', empresaSchema);
const Certificate = mongoose.model('Certificate', certificateSchema);

// ===============================================
// MIDDLEWARES
// ===============================================
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
    try {
        const lab = await Lab.findOne({ apiKey, ativo: true });
        if (!lab) return res.status(401).json({ erro: 'Chave invalida.' });
        req.lab = lab;
        next();
    } catch (error) {
        return res.status(500).json({ erro: 'Erro ao validar chave' });
    }
};

// ==============================================
// ROTAS PUBLICAS
// ==============================================
app.get('/', (req, res) => {
    res.send('<!DOCTYPE html><html><head><title>SNS - Angola</title><style>body{background:#006633;font-family:Arial;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;}.container{background:white;padding:40px;border-radius:10px;width:350px;text-align:center;}h1{color:#006633;}a{display:block;margin:15px;padding:12px;background:#006633;color:white;text-decoration:none;border-radius:5px;}a:hover{background:#004d26;}</style></head><body><div class="container"><h1>SNS - Angola</h1><a href="/ministerio">Ministério da Saúde</a><a href="/lab-login">Laboratório</a></div></body></html>');
});

app.get('/ministerio', (req, res) => {
    res.send('<!DOCTYPE html><html><head><title>Login Ministério</title><style>body{background:#006633;font-family:Arial;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;}.container{background:white;padding:30px;border-radius:10px;width:350px;}h2{color:#006633;text-align:center;}input{width:100%;padding:10px;margin:10px 0;border:1px solid #ddd;border-radius:5px;}button{width:100%;padding:12px;background:#006633;color:white;border:none;border-radius:5px;cursor:pointer;}.error{color:red;display:none;text-align:center;}</style></head><body><div class="container"><h2>Ministério da Saúde</h2><div id="error" class="error"></div><input type="email" id="email" placeholder="Email" value="admin@sns.gov.ao"><input type="password" id="password" placeholder="Senha" value="Admin@2025"><button onclick="login()">Entrar</button></div><script>async function login(){const e=document.getElementById("email").value;const p=document.getElementById("password").value;const r=await fetch("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:e,password:p})});const d=await r.json();if(d.token){localStorage.setItem("token",d.token);window.location.href="/admin-dashboard";}else{document.getElementById("error").style.display="block";document.getElementById("error").innerText="Erro no login";}}</script></body></html>');
});

app.get('/lab-login', (req, res) => {
    res.send('<!DOCTYPE html><html><head><title>Lab Login</title><style>body{background:#006633;font-family:Arial;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;}.container{background:white;padding:30px;border-radius:10px;width:350px;}h2{color:#006633;text-align:center;}input{width:100%;padding:10px;margin:10px 0;border:1px solid #ddd;border-radius:5px;}button{width:100%;padding:12px;background:#006633;color:white;border:none;border-radius:5px;cursor:pointer;}.error{color:red;display:none;text-align:center;}</style></head><body><div class="container"><h2>Acesso Laboratório</h2><div id="error" class="error"></div><input type="text" id="apiKey" placeholder="Digite sua API Key"><button onclick="login()">Entrar</button></div><script>async function login(){const key=document.getElementById("apiKey").value.trim();if(!key)return;const r=await fetch("/api/labs/verificar",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({apiKey:key})});const d=await r.json();if(d.valido){localStorage.setItem("labKey",key);window.location.href="/lab-dashboard";}else{alert(d.erro);}}</script></body></html>');
});

// ==============================================
// API DE AUTENTICACAO
// ==============================================
app.post('/api/login', async (req, res) => {
    try {
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
            res.json({ token });
        } else {
            res.status(401).json({ error: 'Email ou senha incorretos' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Erro no login' });
    }
});

app.post('/api/labs/verificar', async (req, res) => {
    try {
        const { apiKey } = req.body;
        const lab = await Lab.findOne({ apiKey, ativo: true });
        if (lab) return res.json({ valido: true });
        return res.json({ valido: false, erro: 'Chave invalida ou laboratorio inativo.' });
    } catch (error) {
        res.status(500).json({ valido: false, erro: 'Erro no servidor' });
    }
});

// 🔥 ROUTE DE TEST (à supprimer après vérification)
app.get('/api/test-db', async (req, res) => {
    try {
        const totalLabs = await Lab.countDocuments();
        const labsAtivos = await Lab.countDocuments({ ativo: true });
        const todosLabs = await Lab.find().limit(5).select('nome nif provincia ativo createdAt');
        res.json({
            totalLabs,
            labsAtivos,
            exemplo: todosLabs,
            mensagem: "✅ Base de données OK"
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ================================================
// API DE ESTATÍSTICAS - CORRIGÉE
// ================================================
app.get('/api/stats', authMiddleware, async (req, res) => {
    try {
        console.log('📊 Calculando stats...');
        const nLabs = await Lab.countDocuments();
        const nHospitais = await Hospital.countDocuments();
        const nEmpresas = await Empresa.countDocuments();
        const nCertificados = await Certificate.countDocuments().catch(() => 0);

        console.log(`Labs: ${nLabs}, Hospitais: ${nHospitais}, Empresas: ${nEmpresas}`);

        res.json({
            labs: nLabs,
            hospitais: nHospitais,
            empresas: nEmpresas,
            certificados: nCertificados
        });
    } catch (error) {
        console.error('❌ Erro stats:', error);
        res.status(500).json({ error: 'Erro ao carregar estatísticas' });
    }
});

// ================================================
// API LABS - TOTALEMENT CORRIGÉE
// ================================================
app.get('/api/labs', authMiddleware, async (req, res) => {
    try {
        console.log('🔍 /api/labs chamada com:', req.query);
        
        const { provincia, page = 1, ativo } = req.query;
        const limit = 10;
        const skip = (parseInt(page) - 1) * limit;

        // ✅ Filtro corrigido - mostra TODOS par défaut
        let filtro = {};
        if (provincia && provincia !== "") {
            filtro.provincia = provincia;
        }
        if (ativo !== undefined && ativo !== "") {
            filtro.ativo = (ativo === 'true');
        }

        console.log('🔍 Filtro aplicado:', filtro);

        const total = await Lab.countDocuments(filtro);
        const labs = await Lab.find(filtro)
            .select('nome nif provincia telefone diretor ativo createdAt labId tipo')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        console.log(`✅ ${total} labs encontrados, ${labs.length} na página ${page}`);

        res.json({
            labs: labs,
            pages: Math.ceil(total / limit),
            total: total,
            currentPage: parseInt(page)
        });
    } catch (error) {
        console.error('❌ Erro /api/labs:', error);
        res.status(500).json({ error: 'Erro ao listar laboratórios', details: error.message });
    }
});

// ================================================
// DASHBOARD MINISTÉRIO - VERSION FINALE CORRIGÉE
// ================================================
app.get('/admin-dashboard', (req, res) => {
    res.send(`<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ministério da Saúde - SNS Angola</title>
    <style>
        * { margin:0; padding:0; box-sizing:border-box; font-family: 'Segoe UI', Arial, sans-serif; }
        body { display:flex; background:#f5f5f5; min-height: 100vh; }
        .sidebar {
            width:260px; background:#006633; color:white; height:100vh; padding:20px;
            position:fixed; display:flex; flex-direction:column; box-shadow: 2px 0 10px rgba(0,0,0,0.1);
        }
        .sidebar h2 { margin-bottom:30px; text-align:center; padding-bottom:15px; border-bottom:1px solid rgba(255,255,255,0.2); font-size: 22px; }
        .sidebar button { display:block; width:100%; color:rgba(255,255,255,0.9); text-decoration:none; padding:14px; margin:5px 0; border-radius:8px; cursor:pointer; text-align:left; font-size:15px; border:none; background:none; transition: 0.3s; }
        .sidebar button:hover { background:rgba(255,255,255,0.1); color:white; }
        .sidebar .novo-btn { background:#ffa500; color:#00331a; font-weight:bold; margin:20px 0; text-align:center; }
        .sidebar .novo-btn:hover { background:#ffb833; transform: translateY(-2px); }
        .sidebar .sair-btn { background:#cc3300; margin-top:auto; text-align:center; color: white; }
        .sidebar .sair-btn:hover { background:#e63900; }
        .main { margin-left:260px; padding:40px; width:100%; }
        .welcome { background:white; padding:25px; border-left:6px solid #006633; margin-bottom:30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); }
        .secao { display:none; animation: fadeIn 0.3s ease; }
        .secao.active { display:block; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .stats-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:20px; margin-top:20px; }
        .stat-card { background:white; padding:20px; border-radius:8px; box-shadow:0 2px 5px rgba(0,0,0,0.1); text-align:center; }
        .stat-card h3 { color:#666; font-size:14px; margin-bottom:10px; }
        .stat-card p { color:#006633; font-size:28px; font-weight:bold; }
        .card { background:white; padding:30px; border-radius:12px; box-shadow:0 4px 15px rgba(0,0,0,0.05); }
        table { width:100%; border-collapse:collapse; margin-top:20px; }
        th { background:#f8f9fa; color:#333; padding:15px; text-align:left; border-bottom:2px solid #eee; }
        td { padding:15px; border-bottom:1px solid #eee; font-size: 14px; }
        tr:hover { background:#fafafa; }
        .btn-acao { background:#f0f0f0; border:none; padding:8px; border-radius:5px; cursor:pointer; transition:0.2s; margin-right:5px; }
        .btn-acao:hover { background:#e0e0e0; transform: scale(1.1); }
        .status-badge { padding:4px 8px; border-radius:4px; font-weight:bold; font-size:11px; }
        .status-ativo { background:#e8f5e9; color:#2e7d32; }
        .status-inativo { background:#ffebee; color:#c62828; }
        .pagination { display:flex; justify-content:center; gap:10px; margin-top:20px; }
        .pagination button { padding:8px 12px; border:none; background:#006633; color:white; border-radius:5px; cursor:pointer; }
        .pagination button:disabled { background:#ccc; cursor:not-allowed; }
        .filtros { display:flex; gap:10px; margin-bottom:20px; flex-wrap:wrap; }
        .filtros select, .filtros input { padding:8px; border:1px solid #ddd; border-radius:5px; }
        .spinner { border:4px solid #f3f3f3; border-top:4px solid #006633; border-radius:50%; width:30px; height:30px; animation: spin 1s linear infinite; margin:10px auto; display:none; }
        @keyframes spin { 0% { transform:rotate(0deg); } 100% { transform:rotate(360deg); } }
        .debug { background:#fff3cd; padding:10px; border-radius:5px; margin:10px 0; font-family:monospace; font-size:12px; }
    </style>
</head>
<body>
    <div class="sidebar">
        <h2>MINISTÉRIO DA SAÚDE</h2>
        <button onclick="mostrarSeccao('dashboardSection')">📊 Dashboard</button>
        <button onclick="mostrarSeccao('laboratoriosSection')">🏥 Laboratórios</button>
        <button class="novo-btn" onclick="location.href='/novo-laboratorio'">➕ NOVO LABORATÓRIO</button>
        <button onclick="location.href='/api/test-db'" style="background:#ff9800;">🔍 TEST DB</button>
        <button class="sair-btn" onclick="logout()">🚪 Sair</button>
    </div>
    
    <div class="main">
        <div id="welcome" class="welcome">
            <h2>👋 Bem-vindo, Administrador</h2>
            <p>Painel de Controle do Ministério da Saúde</p>
        </div>
        
        <div id="dashboardSection" class="secao active">
            <h2>📊 Painel de Controle</h2>
            <div class="stats-grid">
                <div class="stat-card"><h3>Laboratórios</h3><p id="statsLabs">0</p></div>
                <div class="stat-card"><h3>Hospitais</h3><p id="statsHospitais">0</p></div>
                <div class="stat-card"><h3>Empresas</h3><p id="statsEmpresas">0</p></div>
                <div class="stat-card"><h3>Total</h3><p id="statsTotal">0</p></div>
            </div>
        </div>
        
        <div id="laboratoriosSection" class="secao">
            <div class="card">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                    <h2>🏥 Laboratórios Registados</h2>
                    <button class="btn-acao" onclick="carregarLaboratorios()">🔄 Atualizar</button>
                </div>
                
                <div class="filtros">
                    <select id="filtroProvincia" onchange="carregarLaboratorios()">
                        <option value="">📍 Todas Províncias</option>
                        <option value="Luanda">Luanda</option>
                        <option value="Benguela">Benguela</option>
                        <option value="Huambo">Huambo</option>
                        <option value="Huíla">Huíla</option>
                        <option value="Cabinda">Cabinda</option>
                    </select>
                    <select id="filtroStatus" onchange="carregarLaboratorios()">
                        <option value="">✅ Todos Status</option>
                        <option value="true">🟢 Ativo</option>
                        <option value="false">🔴 Inativo</option>
                    </select>
                </div>
                
                <div id="debugInfo" class="debug" style="display:none;"></div>
                <div id="spinnerLabs" class="spinner"></div>
                
                <table>
                    <thead>
                        <tr>
                            <th>Nome</th>
                            <th>NIF</th>
                            <th>Província</th>
                            <th>Telefone</th>
                            <th>Diretor</th>
                            <th>Status</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody id="tabelaLabs">
                        <tr><td colspan="7" style="text-align:center;padding:40px;">Clique em "Atualizar" ou Dashboard para carregar</td></tr>
                    </tbody>
                </table>
                
                <div class="pagination" id="paginacao" style="display:none;">
                    <button id="prevPage" onclick="mudarPagina(-1)">Anterior</button>
                    <span id="pageInfo">Página 1</span>
                    <button id="nextPage" onclick="mudarPagina(1)">Próxima</button>
                </div>
            </div>
        </div>
    </div>

    <script>
        console.log("🚀 Dashboard ministério carregado");
        
        // Verificar token ao carregar
        let token = localStorage.getItem("token");
        if (!token) {
            alert("❌ Sessão expirada!");
            window.location.href = "/ministerio";
        }

        let currentPage = 1;
        let totalPages = 1;

        function mostrarSeccao(id) {
            document.querySelectorAll('.secao').forEach(s => s.classList.remove('active'));
            document.getElementById(id).classList.add('active');
            if (id === 'laboratoriosSection') {
                carregarLaboratorios();
            } else if (id === 'dashboardSection') {
                carregarStats();
            }
        }

        // ✅ STATS CORRIGIDAS
        function carregarStats() {
            console.log("📊 Carregando stats...");
            const xhr = new XMLHttpRequest();
            xhr.open('GET', '/api/stats', true);
            xhr.setRequestHeader('Authorization', 'Bearer ' + token);
            xhr.onreadystatechange = function() {
                if (xhr.readyState === 4) {
                    if (xhr.status === 200) {
                        const data = JSON.parse(xhr.responseText);
                        console.log("✅ Stats:", data);
                        document.getElementById('statsLabs').textContent = data.labs || 0;
                        document.getElementById('statsHospitais').textContent = data.hospitais || 0;
                        document.getElementById('statsEmpresas').textContent = data.empresas || 0;
                        document.getElementById('statsTotal').textContent = (data.labs||0) + (data.hospitais||0) + (data.empresas||0);
                    } else {
                        console.error("❌ Erro stats:", xhr.status);
                    }
                }
            };
            xhr.send();
        }

        // ✅ LABORATÓRIOS TOTALEMENT CORRIGÉS
        function carregarLaboratorios(page = 1) {
            token = localStorage.getItem("token");
            if (!token) {
                alert("❌ Token inválido!");
                window.location.href = "/ministerio";
                return;
            }

            console.log("🔄 Carregando laboratórios, página:", page);
            currentPage = page;
            
            const tbody = document.getElementById('tabelaLabs');
            const spinner = document.getElementById('spinnerLabs');
            const debug = document.getElementById('debugInfo');
            const paginacao = document.getElementById('paginacao');
            
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">🔄 Carregando...</td></tr>';
            spinner.style.display = 'block';
            debug.style.display = 'none';
            paginacao.style.display = 'none';

            const provincia = document.getElementById('filtroProvincia')?.value || '';
            const status = document.getElementById('filtroStatus')?.value || '';
            
            let url = `/api/labs?page=${page}&limit=10`;
            if (provincia) url += `&provincia=${encodeURIComponent(provincia)}`;
            if (status) url += `&ativo=${status}`;
            
            console.log("📡 URL:", url);

            fetch(url, {
                headers: { 'Authorization': 'Bearer ' + token }
            })
            .then(response => {
                console.log("📡 Status:", response.status);
                document.getElementById('debugInfo').innerHTML = `Status: ${response.status} | URL: ${url}`;
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return response.json();
            })
            .then(data => {
                console.log("✅ Dados:", data);
                spinner.style.display = 'none';
                
                if (!data.labs || data.labs.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#666;padding:40px;">📭 Nenhum laboratório encontrado</td></tr>';
                } else {
                    const html = data.labs.map(lab => {
                        const statusClass = lab.ativo ? 'status-ativo' : 'status-inativo';
                        const statusText = lab.ativo ? '🟢 Ativo' : '🔴 Inativo';
                        const btnStatus = lab.ativo ? '🔴 Desativar' : '🟢 Ativar';
                        
                        return `
                            <tr>
                                <td><strong>${lab.nome || 'N/D'}</strong></td>
                                <td>${lab.nif || 'N/D'}</td>
                                <td>${lab.provincia || 'N/D'}</td>
                                <td>${lab.telefone || 'N/D'}</td>
                                <td>${lab.diretor || 'N/D'}</td>
                                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                                <td>
                                    <button class="btn-acao" onclick="verDetalhes('${lab._id}')" title="Detalhes">👁️</button>
                                    <button class="btn-acao" onclick="toggleStatus('${lab._id}', ${lab.ativo})" title="${btnStatus}">${lab.ativo ? '🔴' : '🟢'}</button>
                                </td>
                            </tr>
                        `;
                    }).join('');
                    tbody.innerHTML = html;
                }
                
                totalPages = data.pages || 1;
                atualizarPaginacao();
                paginacao.style.display = 'flex';
            })
            .catch(error => {
                console.error("❌ Erro:", error);
                spinner.style.display = 'none';
                debug.style.display = 'block';
                debug.innerHTML = '❌ Erro: ' + error.message;
                tbody.innerHTML = '<tr><td colspan="7" style="color:red;text-align:center;">❌ Erro ao carregar dados</td></tr>';
            });
        }

        function atualizarPaginacao() {
            document.getElementById('pageInfo').textContent = `Página ${currentPage} de ${totalPages}`;
            document.getElementById('prevPage').disabled = currentPage <= 1;
            document.getElementById('nextPage').disabled = currentPage >= totalPages;
        }

        function mudarPagina(direcao) {
            const novaPagina = currentPage + direcao;
            if (novaPagina >= 1 && novaPagina <= totalPages) {
                carregarLaboratorios(novaPagina);
            }
        }

        function verDetalhes(id) {
            alert("ID do laboratório: " + id + "
(Função de detalhes em desenvolvimento)");
        }

        function toggleStatus(id, atual) {
            if (confirm(`Tem certeza que deseja ${atual ? 'DESATIVAR' : 'ATIVAR'} este laboratório?`)) {
                alert("Função em desenvolvimento");
                carregarLaboratorios(currentPage);
            }
        }

        function logout() {
            localStorage.removeItem("token");
            localStorage.removeItem("labKey");
            window.location.href = "/";
        }

        // ✅ CARREGA AUTOMATICAMENTE AO ABRIR
        window.onload = function() {
            carregarStats();
            setTimeout(() => carregarLaboratorios(), 1000);
        };
    </script>
</body>
</html>`);
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`🚀 SNS rodando em http://localhost:${PORT}`);
    console.log('🔍 Teste DB: http://localhost:' + PORT + '/api/test-db');
});