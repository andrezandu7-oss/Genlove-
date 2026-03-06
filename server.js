// ========================
// SNS - SISTEMA NACIONAL DE SAÚDE
// MINISTÉRIO DA SAÚDE - ANGOLA
// VERSÃO FINAL COM TODOS OS BOTÕES FUNCIONAIS E DESIGN MODERNO
// ========================

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

// ========================
// CONFIGURAÇÕES
// ========================
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('public'));

// ========================
// CONEXÃO MONGODB
// ========================
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sns';
mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ MongoDB conectado'))
    .catch(err => console.log('❌ MongoDB erro:', err));

// ========================
// FUNÇÕES AUXILIARES
// ========================
function gerarApiKey() {
    return 'SNS-' + Date.now() + '-' + crypto.randomBytes(8).toString('hex').toUpperCase();
}

function gerarChaveHospital() {
    return 'HOSP-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

function gerarChaveEmpresa() {
    return 'EMP-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

function validarNIF(nif) {
    return /^\d{10}$/.test(nif);
}

function gerarNumeroCertificado(tipo) {
    const ano = new Date().getFullYear();
    const mes = (new Date().getMonth() + 1).toString().padStart(2, '0');
    const random = crypto.randomBytes(4).toString('hex').toUpperCase();
    return 'CERT-' + tipo + '-' + ano + mes + '-' + random;
}

// ================================================
// MODELOS DE DADOS
// ================================================
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
    provincia: String,
    endereco: String,
    email: String,
    telefone: String,          // Mantido como 'telefone' (português)
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
        diasIncapacidade: Number,
        tipoAptidao: String,
        restricoes: [String]
    },
    hash: { type: String, unique: true },
    emitidoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Lab' },
    emitidoEm: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Lab = mongoose.model('Lab', labSchema);
const Hospital = mongoose.model('Hospital', hospitalSchema);
const Empresa = mongoose.model('Empresa', empresaSchema);
const Certificate = mongoose.model('Certificate', certificateSchema);

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
    res.send(`<!DOCTYPE html>
<html>
<head><title>SNS - Angola</title>
<style>
body{background:#006633;font-family:Arial;display:flex;justify-content:center;align-items:center;height:100vh;}
.box{background:white;padding:30px;border-radius:10px;width:300px;text-align:center;}
a{display:block;margin:10px;padding:10px;background:#006633;color:white;text-decoration:none;border-radius:5px;}
</style>
</head>
<body>
<div class="box">
<h1>SNS - Angola</h1>
<a href="/ministerio">🏛️ Ministério da Saúde</a>
<a href="/lab-login">🔬 Laboratório</a>
</div>
</body>
</html>`);
});

app.get('/ministerio', (req, res) => {
    res.send(`<!DOCTYPE html>
<html>
<head><title>Login Ministério</title>
<style>
body{background:#006633;font-family:Arial;display:flex;justify-content:center;align-items:center;height:100vh;}
.box{background:white;padding:30px;border-radius:10px;width:300px;}
input{width:100%;padding:10px;margin:10px 0;}
button{width:100%;padding:10px;background:#006633;color:white;border:none;cursor:pointer;}
</style>
</head>
<body>
<div class="box">
<h2>Login Ministério</h2>
<input type="email" id="email" value="admin@sns.gov.ao">
<input type="password" id="password" value="Admin@2025">
<button onclick="login()">Entrar</button>
</div>
<script>
async function login() {
    const r = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: document.getElementById('email').value, password: document.getElementById('password').value })
    });
    const d = await r.json();
    if (d.token) { localStorage.setItem('token', d.token); window.location.href = '/admin-dashboard'; }
    else alert('Erro');
}
</script>
</body>
</html>`);
});

app.get('/lab-login', (req, res) => {
    res.send(`<!DOCTYPE html>
<html>
<head><title>Login Laboratório</title>
<style>
body{background:#006633;font-family:Arial;display:flex;justify-content:center;align-items:center;height:100vh;}
.box{background:white;padding:30px;border-radius:10px;width:300px;}
input{width:100%;padding:10px;margin:10px 0;}
button{width:100%;padding:10px;background:#006633;color:white;border:none;cursor:pointer;}
</style>
</head>
<body>
<div class="box">
<h2>Login Laboratório</h2>
<input type="text" id="apiKey" placeholder="Digite sua API Key">
<button onclick="login()">Entrar</button>
</div>
<script>
function login() {
    const key = document.getElementById('apiKey').value;
    if (key) { localStorage.setItem('labKey', key); window.location.href = '/lab-dashboard'; }
    else alert('Digite a API Key');
}
</script>
</body>
</html>`);
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
        res.json({ token, user: { nome: user.nome, email, role: user.role } });
    } else {
        res.status(401).json({ error: 'Email ou senha incorretos' });
    }
});

// ================================================
// DASHBOARD DO MINISTÉRIO (VERSION SIMPLIFIÉE ET FONCTIONNELLE)
// ================================================
app.get('/admin-dashboard', (req, res) => {
    res.send(`<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Ministério da Saúde - SNS Angola</title>
    <style>
        body { font-family: Arial; margin: 0; display: flex; }
        .sidebar { width: 250px; background: #006633; color: white; height: 100vh; padding: 20px; position: fixed; }
        .sidebar a { display: block; color: white; text-decoration: none; padding: 10px; margin: 5px 0; }
        .sidebar a:hover { background: #004d26; }
        .main { margin-left: 290px; padding: 30px; width: 100%; }
        .btn { background: #006633; color: white; border: none; padding: 10px 20px; cursor: pointer; margin: 5px; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #006633; color: white; padding: 10px; }
        td { padding: 10px; border-bottom: 1px solid #ddd; }
        .modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); align-items: center; justify-content: center; }
        .modal-content { background: white; padding: 20px; border-radius: 10px; width: 400px; }
        .modal-content input { width: 100%; padding: 8px; margin: 5px 0; }
    </style>
</head>
<body>
    <div class="sidebar">
        <h2>SNS - Ministério</h2>
        <a href="#" onclick="mostrarSecao('dashboard')">📊 Dashboard</a>
        <a href="#" onclick="mostrarSecao('labs')">🏥 Laboratórios</a>
        <a href="#" onclick="mostrarSecao('hospitais')">🏥 Hospitais</a>
        <a href="#" onclick="mostrarSecao('empresas')">🏢 Empresas</a>
        <button onclick="logout()" style="margin-top:20px; background:#dc3545; color:white; border:none; padding:10px; width:100%;">Sair</button>
    </div>

    <div class="main">
        <div id="secaoDashboard">
            <h1>Dashboard</h1>
            <div>Total Laboratórios: <span id="totalLabs">0</span></div>
            <div>Total Hospitais: <span id="totalHospitais">0</span></div>
            <div>Total Empresas: <span id="totalEmpresas">0</span></div>
        </div>

        <div id="secaoLabs" style="display:none;">
            <h1>Laboratórios</h1>
            <button class="btn" onclick="mostrarModalLab()">+ Novo Laboratório</button>
            <table id="labsTable">
                <thead><tr><th>Nome</th><th>NIF</th><th>Província</th><th>Status</th><th>Ações</th></tr></thead>
                <tbody></tbody>
            </table>
        </div>

        <div id="secaoHospitais" style="display:none;">
            <h1>Hospitais</h1>
            <button class="btn" onclick="mostrarModalHospital()">+ Novo Hospital</button>
            <table id="hospitaisTable">
                <thead><tr><th>Nome</th><th>NIF</th><th>Província</th><th>Diretor</th><th>Status</th><th>Ações</th></tr></thead>
                <tbody></tbody>
            </table>
        </div>

        <div id="secaoEmpresas" style="display:none;">
            <h1>Empresas</h1>
            <button class="btn" onclick="mostrarModalEmpresa()">+ Nova Empresa</button>
            <table id="empresasTable">
                <thead><tr><th>Nome</th><th>NIF</th><th>Responsável</th><th>Status</th><th>Ações</th></tr></thead>
                <tbody></tbody>
            </table>
        </div>
    </div>

    <!-- Modais -->
    <div id="modalLab" class="modal">
        <div class="modal-content">
            <h3>Novo Laboratório</h3>
            <input type="text" id="labNome" placeholder="Nome">
            <input type="text" id="labNIF" placeholder="NIF (10 dígitos)" maxlength="10">
            <input type="text" id="labProvincia" placeholder="Província">
            <input type="email" id="labEmail" placeholder="Email">
            <input type="text" id="labDiretor" placeholder="Diretor">
            <p id="labError" style="color:red; display:none;">NIF inválido</p>
            <button onclick="criarLaboratorio()" style="background:#006633; color:white; padding:10px; width:100%;">Criar</button>
            <button onclick="fecharModal('modalLab')" style="margin-top:5px;">Cancelar</button>
        </div>
    </div>

    <div id="modalHospital" class="modal">
        <div class="modal-content">
            <h3>Novo Hospital</h3>
            <input type="text" id="hospitalNome" placeholder="Nome">
            <input type="text" id="hospitalNIF" placeholder="NIF (10 dígitos)" maxlength="10">
            <input type="text" id="hospitalProvincia" placeholder="Província">
            <input type="text" id="hospitalDiretor" placeholder="Diretor">
            <input type="email" id="hospitalEmail" placeholder="Email">
            <p id="hospitalError" style="color:red; display:none;">NIF inválido</p>
            <button onclick="criarHospital()" style="background:#006633; color:white; padding:10px; width:100%;">Criar</button>
            <button onclick="fecharModal('modalHospital')" style="margin-top:5px;">Cancelar</button>
        </div>
    </div>

    <div id="modalEmpresa" class="modal">
        <div class="modal-content">
            <h3>Nova Empresa</h3>
            <input type="text" id="empresaNome" placeholder="Nome da empresa">
            <input type="text" id="empresaNIF" placeholder="NIF (10 dígitos)" maxlength="10">
            <input type="text" id="empresaResp" placeholder="Responsável">
            <input type="email" id="empresaEmail" placeholder="Email">
            <p id="empresaError" style="color:red; display:none;">NIF inválido</p>
            <button onclick="criarEmpresa()" style="background:#006633; color:white; padding:10px; width:100%;">Criar</button>
            <button onclick="fecharModal('modalEmpresa')" style="margin-top:5px;">Cancelar</button>
        </div>
    </div>

    <script>
        const token = localStorage.getItem('token');
        if (!token) window.location.href = '/ministerio';

        function mostrarSecao(s) {
            document.getElementById('secaoDashboard').style.display = 'none';
            document.getElementById('secaoLabs').style.display = 'none';
            document.getElementById('secaoHospitais').style.display = 'none';
            document.getElementById('secaoEmpresas').style.display = 'none';
            if (s === 'dashboard') {
                document.getElementById('secaoDashboard').style.display = 'block';
                carregarStats();
            }
            if (s === 'labs') {
                document.getElementById('secaoLabs').style.display = 'block';
                carregarLabs();
            }
            if (s === 'hospitais') {
                document.getElementById('secaoHospitais').style.display = 'block';
                carregarHospitais();
            }
            if (s === 'empresas') {
                document.getElementById('secaoEmpresas').style.display = 'block';
                carregarEmpresas();
            }
        }

        function mostrarModalLab() { document.getElementById('modalLab').style.display = 'flex'; }
        function mostrarModalHospital() { document.getElementById('modalHospital').style.display = 'flex'; }
        function mostrarModalEmpresa() { document.getElementById('modalEmpresa').style.display = 'flex'; }
        function fecharModal(id) { document.getElementById(id).style.display = 'none'; }

        async function carregarStats() {
            try {
                const r = await fetch('/api/stats', { headers: { 'Authorization': 'Bearer ' + token } });
                const d = await r.json();
                document.getElementById('totalLabs').innerText = d.labs || 0;
                document.getElementById('totalHospitais').innerText = d.hospitais || 0;
                document.getElementById('totalEmpresas').innerText = d.empresas || 0;
            } catch (e) { console.error(e); }
        }

        async function carregarLabs() {
            try {
                const r = await fetch('/api/labs', { headers: { 'Authorization': 'Bearer ' + token } });
                const labs = await r.json();
                let html = '';
                labs.forEach(l => {
                    html += '<tr><td>' + l.nome + '</td><td>' + l.nif + '</td><td>' + (l.provincia || '') + '</td><td>' + (l.ativo ? '✅ Ativo' : '❌ Inativo') + '</td><td><button onclick="desativarLab(\'' + l._id + '\')">Desativar</button></td></tr>';
                });
                document.querySelector('#labsTable tbody').innerHTML = html;
            } catch (e) { console.error(e); }
        }

        async function carregarHospitais() {
            try {
                const r = await fetch('/api/hospitais', { headers: { 'Authorization': 'Bearer ' + token } });
                const hosp = await r.json();
                let html = '';
                hosp.forEach(h => {
                    html += '<tr><td>' + h.nome + '</td><td>' + h.nif + '</td><td>' + (h.provincia || '') + '</td><td>' + (h.diretor || '') + '</td><td>' + (h.ativo ? '✅ Ativo' : '❌ Inativo') + '</td><td><button onclick="desativarHospital(\'' + h._id + '\')">Desativar</button></td></tr>';
                });
                document.querySelector('#hospitaisTable tbody').innerHTML = html;
            } catch (e) { console.error(e); }
        }

        async function carregarEmpresas() {
            try {
                const r = await fetch('/api/empresas', { headers: { 'Authorization': 'Bearer ' + token } });
                const emp = await r.json();
                let html = '';
                emp.forEach(e => {
                    html += '<tr><td>' + e.nome + '</td><td>' + e.nif + '</td><td>' + (e.responsavel ? e.responsavel.nome : '') + '</td><td>' + (e.ativo ? '✅ Ativo' : '❌ Inativo') + '</td><td><button onclick="desativarEmpresa(\'' + e._id + '\')">Desativar</button></td></tr>';
                });
                document.querySelector('#empresasTable tbody').innerHTML = html;
            } catch (e) { console.error(e); }
        }

        async function criarLaboratorio() {
            const nif = document.getElementById('labNIF').value;
            if (!/^\d{10}$/.test(nif)) { document.getElementById('labError').style.display = 'block'; return; }
            const dados = {
                nome: document.getElementById('labNome').value,
                nif,
                provincia: document.getElementById('labProvincia').value,
                email: document.getElementById('labEmail').value,
                diretor: document.getElementById('labDiretor').value,
                tipo: 'laboratorio'
            };
            const r = await fetch('/api/labs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                body: JSON.stringify(dados)
            });
            const d = await r.json();
            if (d.success) {
                alert('✅ Laboratório criado!\n\n🔑 API Key: ' + d.apiKey);
                fecharModal('modalLab');
                carregarLabs();
            } else {
                alert('Erro: ' + d.erro);
            }
        }

        async function criarHospital() {
            const nif = document.getElementById('hospitalNIF').value;
            if (!/^\d{10}$/.test(nif)) { document.getElementById('hospitalError').style.display = 'block'; return; }
            const dados = {
                nome: document.getElementById('hospitalNome').value,
                nif,
                provincia: document.getElementById('hospitalProvincia').value,
                diretor: document.getElementById('hospitalDiretor').value,
                email: document.getElementById('hospitalEmail').value
            };
            const r = await fetch('/api/hospitais', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                body: JSON.stringify(dados)
            });
            const d = await r.json();
            if (d.success) {
                alert('✅ Hospital criado!\n\n🔑 Chave: ' + d.chave);
                fecharModal('modalHospital');
                carregarHospitais();
            } else {
                alert('Erro: ' + d.erro);
            }
        }

        async function criarEmpresa() {
            const nif = document.getElementById('empresaNIF').value;
            if (!/^\d{10}$/.test(nif)) { document.getElementById('empresaError').style.display = 'block'; return; }
            const dados = {
                nome: document.getElementById('empresaNome').value,
                nif,
                responsavel: { nome: document.getElementById('empresaResp').value },
                email: document.getElementById('empresaEmail').value
            };
            const r = await fetch('/api/empresas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                body: JSON.stringify(dados)
            });
            const d = await r.json();
            if (d.success) {
                alert('✅ Empresa criada!\n\n🔑 Chave: ' + d.chave);
                fecharModal('modalEmpresa');
                carregarEmpresas();
            } else {
                alert('Erro: ' + d.erro);
            }
        }

        async function desativarLab(id) {
            if (!confirm('Tem certeza?')) return;
            await fetch('/api/labs/' + id, { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + token } });
            carregarLabs();
        }

        async function desativarHospital(id) {
            if (!confirm('Tem certeza?')) return;
            await fetch('/api/hospitais/' + id, { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + token } });
            carregarHospitais();
        }

        async function desativarEmpresa(id) {
            if (!confirm('Tem certeza?')) return;
            await fetch('/api/empresas/' + id, { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + token } });
            carregarEmpresas();
        }

        function logout() {
            localStorage.removeItem('token');
            localStorage.removeItem('labKey');
            window.location.href = '/';
        }

        mostrarSecao('dashboard'); // Affiche le dashboard par défaut
    </script>
</body>
</html>`);
});

// ============================================
// DASHBOARD DO LABORATÓRIO
// ============================================
app.get('/lab-dashboard', (req, res) => {
    res.send(`<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Laboratório - SNS</title>
    <style>
        * { margin:0; padding:0; box-sizing:border-box; font-family: 'Segoe UI', Arial, sans-serif; }
        body { display:flex; background:#f5f5f5; min-height:100vh; }
        .sidebar {
            width:260px;
            background:#006633;
            color:white;
            height:100vh;
            padding:20px;
            position:fixed;
            display:flex;
            flex-direction:column;
            box-shadow:2px 0 10px rgba(0,0,0,0.1);
        }
        .sidebar h2 { margin-bottom:30px; text-align:center; padding-bottom:15px; border-bottom:1px solid rgba(255,255,255,0.2); font-size:22px; }
        .sidebar button, .sidebar .nav-link {
            display:block;
            width:100%;
            color:rgba(255,255,255,0.9);
            text-decoration:none;
            padding:14px;
            margin:5px 0;
            border-radius:8px;
            cursor:pointer;
            text-align:left;
            font-size:15px;
            border:none;
            background:none;
            transition:0.3s;
        }
        .sidebar button:hover { background:rgba(255,255,255,0.1); color:white; }
        .sidebar .novo-btn {
            background:#ffa500;
            color:#00331a;
            font-weight:bold;
            margin:20px 0;
            text-align:center;
        }
        .sidebar .novo-btn:hover { background:#ffb833; transform:translateY(-2px); }
        .sidebar .sair-btn {
            background:#cc3300;
            margin-top:auto;
            text-align:center;
            color:white;
        }
        .sidebar .sair-btn:hover { background:#e63900; }
        .main {
            margin-left:260px;
            padding:40px;
            width:100%;
        }
        .welcome {
            background:white;
            padding:25px;
            border-left:6px solid #006633;
            margin-bottom:30px;
            border-radius:8px;
            box-shadow:0 2px 10px rgba(0,0,0,0.05);
        }
        .secao { display:none; }
        .secao.active { display:block; }
        .card { background:white; padding:30px; border-radius:12px; box-shadow:0 4px 15px rgba(0,0,0,0.05); }
        table { width:100%; border-collapse:collapse; margin-top:20px; }
        th { background:#f8f9fa; color:#333; padding:15px; text-align:left; border-bottom:2px solid #eee; }
        td { padding:15px; border-bottom:1px solid #eee; font-size:14px; }
        tr:hover { background:#fafafa; }
        .btn-acao { background:#f0f0f0; border:none; padding:8px; border-radius:5px; cursor:pointer; transition:0.2s; margin-right:5px; }
        .btn-acao:hover { background:#e0e0e0; transform:scale(1.1); }
        .status-badge { padding:4px 8px; border-radius:4px; font-weight:bold; font-size:11px; background:#e8f5e9; color:#2e7d32; }
        .modal { display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); align-items:center; justify-content:center; }
        .modal-content { background:white; padding:20px; border-radius:10px; width:400px; }
        .modal-content input, .modal-content select { width:100%; padding:8px; margin:5px 0; }
    </style>
</head>
<body>
    <div class="sidebar">
        <h2>SNS - LABORATÓRIO</h2>
        <button onclick="mostrarSeccao('dashboardSection')">📊 Dashboard</button>
        <button onclick="mostrarSeccao('certificadosSection')">📋 Certificados</button>
        <button class="novo-btn" onclick="location.href='/novo-certificado'">➕ NOVO CERTIFICADO</button>
        <button class="sair-btn" onclick="logout()">🚪 Sair</button>
    </div>

    <div class="main">
        <div id="welcome" class="welcome">
            <h2>Carregando...</h2>
        </div>

        <div id="dashboardSection" class="secao active">
            <div class="card">
                <h3>Estatísticas</h3>
                <p>Total de certificados emitidos: <span id="totalCerts">0</span></p>
            </div>
        </div>

        <div id="certificadosSection" class="secao">
            <div class="card">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                    <h2>📋 Certificados Emitidos</h2>
                    <button class="btn-acao" onclick="carregarCertificados()">🔄 Atualizar</button>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>Nº Certificado</th>
                            <th>Tipo</th>
                            <th>Paciente</th>
                            <th>Data</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody id="tabelaCertificados">
                        <tr><td colspan="5" style="text-align:center;">Carregando...</td></tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <div id="modalCertificado" class="modal">
        <div class="modal-content">
            <h3>Novo Certificado</h3>
            <input type="text" id="certNome" placeholder="Nome completo">
            <select id="certTipo">
                <option value="1">🧬 Genótipo</option>
                <option value="2">🩺 Boa Saúde</option>
                <option value="3">📋 Incapacidade</option>
                <option value="4">💪 Aptidão</option>
            </select>
            <input type="text" id="certBI" placeholder="BI">
            <button onclick="emitirCertificado()" style="background:#006633; color:white; padding:10px; width:100%;">Emitir</button>
            <button onclick="fecharModal()" style="margin-top:5px;">Cancelar</button>
        </div>
    </div>

    <script>
        const labKey = localStorage.getItem('labKey');
        if (!labKey) window.location.href = '/lab-login';

        const tipos = ["", "GENÓTIPO", "BOA SAÚDE", "INCAPACIDADE", "APTIDÃO", "SAÚDE MATERNA", "PRÉ-NATAL", "EPIDEMIOLÓGICO", "CSD"];

        function mostrarSeccao(id) {
            document.querySelectorAll('.secao').forEach(s => s.classList.remove('active'));
            document.getElementById(id).classList.add('active');
            if (id === 'certificadosSection') carregarCertificados();
        }

        function mostrarModal() { document.getElementById('modalCertificado').style.display = 'flex'; }
        function fecharModal() { document.getElementById('modalCertificado').style.display = 'none'; }

        async function carregarDados() {
            try {
                const r = await fetch('/api/labs/me', { headers: { 'x-api-key': labKey } });
                const data = await r.json();
                document.getElementById('welcome').innerHTML = '<h2>👋 Olá, ' + data.nome + '</h2><p>Laboratório Autorizado pelo Ministério da Saúde</p>';
            } catch (e) { console.error(e); }
        }

        async function carregarCertificados() {
            const tbody = document.getElementById('tabelaCertificados');
            try {
                const r = await fetch('/api/certificados/lab', { headers: { 'x-api-key': labKey } });
                const lista = await r.json();
                if (!lista || lista.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:40px;">Nenhum certificado emitido ainda.</td></tr>';
                    return;
                }
                let html = '';
                lista.forEach(c => {
                    const tipoNome = tipos[c.tipo] || 'OUTRO';
                    const paciente = c.paciente?.nomeCompleto || 'N/I';
                    const data = new Date(c.emitidoEm).toLocaleDateString('pt-PT');
                    html += '<tr>';
                    html += '<td><strong>' + c.numero + '</strong></td>';
                    html += '<td><span class="status-badge">' + tipoNome + '</span></td>';
                    html += '<td>' + paciente + '</td>';
                    html += '<td>' + data + '</td>';
                    html += '<td>';
                    html += '<button class="btn-acao" onclick="gerarPDF(\'' + c.numero + '\', \'view\')" title="Visualizar">👁️</button>';
                    html += '<button class="btn-acao" onclick="gerarPDF(\'' + c.numero + '\', \'print\')" title="Imprimir">🖨️</button>';
                    html += '<button class="btn-acao" onclick="gerarPDF(\'' + c.numero + '\', \'download\')" title="Baixar">📥</button>';
                    html += '</td>';
                    html += '</tr>';
                });
                tbody.innerHTML = html;
            } catch (e) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:red;">Erro ao carregar dados.</td></tr>';
            }
        }

        async function gerarPDF(numero, acao) {
            try {
                const res = await fetch('/api/certificados/pdf', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-api-key': labKey },
                    body: JSON.stringify({ numero })
                });
                if (!res.ok) throw new Error();
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                if (acao === 'view') window.open(url, '_blank');
                if (acao === 'download') {
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'Certificado-' + numero + '.pdf';
                    a.click();
                }
                if (acao === 'print') {
                    const win = window.open(url, '_blank');
                    win.onload = () => win.print();
                }
            } catch (e) {
                alert('Erro ao processar PDF');
            }
        }

        async function emitirCertificado() {
            const dados = {
                paciente: {
                    nomeCompleto: document.getElementById('certNome').value,
                    bi: document.getElementById('certBI').value
                },
                dados: {}
            };
            const tipo = document.getElementById('certTipo').value;
            const r = await fetch('/api/certificados/emitir/' + tipo, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-api-key': labKey },
                body: JSON.stringify(dados)
            });
            const d = await r.json();
            if (d.success) {
                alert('✅ Certificado emitido!\nNº: ' + d.numero);
                fecharModal();
                carregarCertificados();
            } else {
                alert('Erro: ' + d.erro);
            }
        }

        function logout() {
            localStorage.removeItem('labKey');
            window.location.href = '/';
        }

        carregarDados();
    </script>
</body>
</html>`);
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
        res.json({ success: true, apiKey });
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
        res.status(500).json({ error: 'Erro interno' });
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
        const chave = gerarChaveHospital();
        const hospital = new Hospital({ ...dados, chaveAcesso: chave });
        await hospital.save();
        res.json({ success: true, chave });
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

// ============================================
// API DE EMPRESAS
// ============================================
app.post('/api/empresas', authMiddleware, async (req, res) => {
    try {
        const dados = req.body;
        if (!dados.nif || !validarNIF(dados.nif)) {
            return res.status(400).json({ erro: 'NIF inválido' });
        }
        const chave = gerarChaveEmpresa();
        const empresa = new Empresa({ ...dados, chaveAcesso: chave });
        await empresa.save();
        res.json({ success: true, chave });
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

// ============================================
// API DE CERTIFICADOS
// ============================================
app.post('/api/certificados/emitir/:tipo', labMiddleware, async (req, res) => {
    try {
        const tipo = parseInt(req.params.tipo);
        const dados = req.body;
        const numero = gerarNumeroCertificado(tipo);
        const hash = crypto.createHash('sha256').update(numero + JSON.stringify(dados)).digest('hex');
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

app.post('/api/certificados/pdf', labMiddleware, async (req, res) => {
    try {
        const { numero } = req.body;
        if (!numero) return res.status(400).json({ error: 'Número do certificado não fornecido' });

        const certificado = await Certificate.findOne({ numero, emitidoPor: req.lab._id });
        if (!certificado) return res.status(404).json({ error: 'Certificado não encontrado' });

        const lab = req.lab;
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=certificado-' + numero + '.pdf');
        doc.pipe(res);

        // Cabeçalho
        doc.fillColor('#006633').fontSize(20).text('REPÚBLICA DE ANGOLA', 0, 50, { align: 'center' });
        doc.fontSize(16).text('MINISTÉRIO DA SAÚDE', 0, 80, { align: 'center' });
        doc.fontSize(24).text('SISTEMA NACIONAL DE SAÚDE', 0, 110, { align: 'center' });
        doc.strokeColor('#006633').lineWidth(2).moveTo(doc.page.width / 2 - 250, 150).lineTo(doc.page.width / 2 + 250, 150).stroke();

        let y = 180;
        doc.fillColor('#006633').fontSize(14).text(lab.nome, 50, y);
        doc.fontSize(10).fillColor('#666')
            .text('NIF: ' + lab.nif + ' | ' + (lab.provincia || ''), 50, y + 20)
            .text('Endereço: ' + (lab.endereco || '') + ' | Tel: ' + (lab.telefone || ''), 50, y + 35);
        y += 60;

        doc.fillColor('#006633').fontSize(12).text('CERTIFICADO Nº: ' + numero, 50, y);
        doc.fontSize(10).fillColor('#666').text('Data de Emissão: ' + new Date(certificado.emitidoEm).toLocaleDateString('pt-PT'), 50, y + 15);
        y += 40;

        doc.fillColor('#006633').fontSize(12).text('DADOS DO PACIENTE:', 50, y);
        y += 20;
        doc.fillColor('#000').fontSize(11)
            .text('Nome: ' + (certificado.paciente?.nomeCompleto || 'Não informado'), 70, y);
        y += 15;
        doc.text('BI: ' + (certificado.paciente?.bi || 'Não informado'), 70, y);
        y += 15;
        if (certificado.paciente?.dataNascimento) {
            doc.text('Data Nascimento: ' + new Date(certificado.paciente.dataNascimento).toLocaleDateString('pt-PT'), 70, y);
            y += 15;
        }

        doc.fillColor('#006633').fontSize(12).text('DADOS MÉDICOS:', 50, y);
        y += 20;
        const tipos = {
            1: 'GENÓTIPO', 2: 'BOA SAÚDE', 3: 'INCAPACIDADE', 4: 'APTIDÃO',
            5: 'SAÚDE MATERNA', 6: 'PRÉ-NATAL', 7: 'EPIDEMIOLÓGICO', 8: 'CSD'
        };
        doc.fillColor('#333').fontSize(12).text(tipos[certificado.tipo] || 'CERTIFICADO MÉDICO', 70, y);
        y += 25;

        // Exames
        if (certificado.dados) {
            const exames = Object.entries(certificado.dados).map(([k, v]) => ({ exame: k.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()), valor: v }));
            exames.forEach(item => {
                doc.fontSize(10).fillColor('#000').text(item.exame + ': ' + item.valor, 70, y);
                y += 20;
            });
        }

        // Assinaturas
        y += 20;
        doc.lineWidth(1).moveTo(70, y).lineTo(270, y).stroke();
        doc.fontSize(10).text('Assinatura do Responsável', 70, y + 5)
            .text('________________________', 70, y + 20);
        doc.lineWidth(1).moveTo(350, y).lineTo(550, y).stroke();
        doc.fontSize(10).text('Assinatura do Diretor', 350, y + 5)
            .text('________________________', 350, y + 20);
        y += 50;

        // QR Code
        try {
            const textoQR = numero + '|' + lab.nome + '|' + (certificado.paciente?.nomeCompleto || 'PACIENTE');
            const qrBuffer = await QRCode.toBuffer(textoQR, { errorCorrectionLevel: 'H', margin: 1, width: 100, color: { dark: '#006633', light: '#FFFFFF' } });
            const qrX = 310 - 50;
            const qrY = y - 20;
            doc.image(qrBuffer, qrX, qrY, { width: 100 });
            doc.fontSize(7).fillColor('#006633').text('SCAN PARA VERIFICAR', qrX, qrY - 12, { width: 100, align: 'center' });
        } catch (qrError) {
            doc.fontSize(7).fillColor('#999').text('QR indisponível', 280, y - 10);
        }

        doc.fontSize(8).fillColor('#666').text('Documento válido em todo território nacional', 0, 780, { align: 'center' });
        doc.end();
    } catch (error) {
        console.error('Erro PDF:', error);
        res.status(500).json({ error: 'Erro ao gerar PDF: ' + error.message });
    }
});

// ============================================
// STATS GLOBAIS (MINISTÉRIO)
// ============================================
app.get('/api/stats', authMiddleware, async (req, res) => {
    try {
        const stats = {
            labs: await Lab.countDocuments({ ativo: true }),
            hospitais: await Hospital.countDocuments({ ativo: true }),
            empresas: await Empresa.countDocuments({ ativo: true })
        };
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao carregar estatísticas' });
    }
});

// ============================================
// ROTA PARA O FORMULÁRIO DE CRIAÇÃO DE LABORATÓRIO (MODERNO)
// ============================================
app.get('/novo-laboratorio', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'novo-laboratorio.html'));
});

// ============================================
// ROTA PARA O FORMULÁRIO DE CRIAÇÃO DE CERTIFICADO
// ============================================
app.get('/novo-certificado', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'novo-certificado.html'));
});

// ============================================
// GERAÇÃO PDF PARA LABORATÓRIO
// ============================================
app.post('/api/labs/pdf', authMiddleware, async (req, res) => {
    try {
        const labData = req.body;
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=Laboratorio_' + labData.nome.replace(/\s/g, '_') + '.pdf');
        doc.pipe(res);

        doc.fillColor('#006633').fontSize(20).text('REPÚBLICA DE ANGOLA', 0, 50, { align: 'center' });
        doc.fontSize(16).text('MINISTÉRIO DA SAÚDE', 0, 80, { align: 'center' });
        doc.fontSize(24).text('SISTEMA NACIONAL DE SAÚDE', 0, 110, { align: 'center' });
        doc.strokeColor('#006633').lineWidth(2).moveTo(doc.page.width / 2 - 250, 150).lineTo(doc.page.width / 2 + 250, 150).stroke();

        let y = 180;
        doc.fillColor('#006633').fontSize(16).text('REGISTO DE LABORATÓRIO', 50, y);
        y += 30;

        const addLine = (label, value) => {
            if (value) {
                doc.fillColor('#000').fontSize(12).text(label + ': ' + value, 70, y);
                y += 20;
            }
        };

        addLine('Nome', labData.nome);
        addLine('NIF', labData.nif);
        addLine('Tipo', labData.tipo);
        addLine('Província', labData.provincia);
        addLine('Município', labData.municipio);
        addLine('Endereço', labData.endereco);
        addLine('Telefone 1', labData.telefone);
        addLine('Telefone 2', labData.telefone2);
        addLine('Email', labData.email);
        addLine('Website', labData.website);
        addLine('Diretor', labData.diretor);
        addLine('Responsável Técnico', labData.responsavelTecnico);
        addLine('Licença', labData.licenca);
        if (labData.validadeLicenca) addLine('Validade Licença', new Date(labData.validadeLicenca).toLocaleDateString('pt-PT'));
        addLine('Status', labData.ativo ? 'Ativo' : 'Inativo');

        y += 10;
        doc.fillColor('#b33').fontSize(12).text('CHAVE API (confidencial)', 70, y);
        y += 20;
        doc.fillColor('#000').fontSize(10).text(labData.apiKey, 70, y, { width: 400 });

        y += 50;
        doc.fillColor('#666').fontSize(10).text('Esta chave é pessoal e intransferível. Não a compartilhe.', 70, y);

        doc.end();
    } catch (error) {
        console.error('Erro PDF laboratório:', error);
        res.status(500).json({ error: 'Erro ao gerar PDF' });
    }
});

// ============================================
// INICIALIZAÇÃO DO SERVIDOR
// ============================================
app.listen(PORT, () => {
    console.log('✅ SNS Online na porta ' + PORT);
});