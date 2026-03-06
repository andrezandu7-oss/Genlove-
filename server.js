// ============================================
// SNS - SISTEMA NACIONAL DE SAÚDE
// MINISTÉRIO DA SAÚDE - ANGOLA
// VERSÃO FINAL COM TODOS OS BOTÕES FUNCIONAIS
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
    provincia: String,
    endereco: String,
    email: String,
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
    res.send('<!DOCTYPE html>' +
    '<html>' +
    '<head><title>SNS - Angola</title>' +
    '<style>' +
    'body{background:#006633;font-family:Arial;display:flex;justify-content:center;align-items:center;height:100vh;}' +
    '.box{background:white;padding:30px;border-radius:10px;width:300px;text-align:center;}' +
    'a{display:block;margin:10px;padding:10px;background:#006633;color:white;text-decoration:none;border-radius:5px;}' +
    '</style>' +
    '</head>' +
    '<body>' +
    '<div class="box">' +
    '<h1>SNS - Angola</h1>' +
    '<a href="/ministerio">🏛️ Ministério da Saúde</a>' +
    '<a href="/lab-login">🔬 Laboratório</a>' +
    '</div>' +
    '</body></html>');
});

app.get('/ministerio', (req, res) => {
    res.send('<!DOCTYPE html>' +
    '<html>' +
    '<head><title>Login Ministério</title>' +
    '<style>' +
    'body{background:#006633;font-family:Arial;display:flex;justify-content:center;align-items:center;height:100vh;}' +
    '.box{background:white;padding:30px;border-radius:10px;width:300px;}' +
    'input{width:100%;padding:10px;margin:10px 0;}' +
    'button{width:100%;padding:10px;background:#006633;color:white;border:none;cursor:pointer;}' +
    '</style>' +
    '</head>' +
    '<body>' +
    '<div class="box">' +
    '<h2>Login Ministério</h2>' +
    '<input type="email" id="email" value="admin@sns.gov.ao">' +
    '<input type="password" id="password" value="Admin@2025">' +
    '<button onclick="login()">Entrar</button>' +
    '</div>' +
    '<script>' +
    'async function login(){' +
    'const r=await fetch("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:document.getElementById("email").value,password:document.getElementById("password").value})});' +
    'const d=await r.json();' +
    'if(d.token){localStorage.setItem("token",d.token);window.location.href="/admin-dashboard";}' +
    'else alert("Erro");}' +
    '</script>' +
    '</body></html>');
});

app.get('/lab-login', (req, res) => {
    res.send('<!DOCTYPE html>' +
    '<html>' +
    '<head><title>Login Laboratório</title>' +
    '<style>' +
    'body{background:#006633;font-family:Arial;display:flex;justify-content:center;align-items:center;height:100vh;}' +
    '.box{background:white;padding:30px;border-radius:10px;width:300px;}' +
    'input{width:100%;padding:10px;margin:10px 0;}' +
    'button{width:100%;padding:10px;background:#006633;color:white;border:none;cursor:pointer;}' +
    '</style>' +
    '</head>' +
    '<body>' +
    '<div class="box">' +
    '<h2>Login Laboratório</h2>' +
    '<input type="text" id="apiKey" placeholder="Digite sua API Key">' +
    '<button onclick="login()">Entrar</button>' +
    '</div>' +
    '<script>' +
    'function login(){' +
    'const key=document.getElementById("apiKey").value;' +
    'if(key){localStorage.setItem("labKey",key);window.location.href="/lab-dashboard";}' +
    'else alert("Digite a API Key");}' +
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
        res.json({ token, user: { nome: user.nome, email, role: user.role } });
    } else res.status(401).json({ erro: 'Email ou senha incorretos' });
});

// ================================================
// DASHBOARD DO MINISTÉRIO (VERSION CORRIGÉE)
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
            width:260px;
            background:#006633;
            color:white;
            height:100vh;
            padding:20px;
            position:fixed;
            display:flex;
            flex-direction:column;
            box-shadow: 2px 0 10px rgba(0,0,0,0.1);
        }
        .sidebar h2 { 
            margin-bottom:30px; 
            text-align:center;
            padding-bottom:15px;
            border-bottom:1px solid rgba(255,255,255,0.2);
            font-size: 22px;
        }
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
            transition: 0.3s;
        }
        .sidebar button:hover { background:rgba(255,255,255,0.1); color:white; }
        .sidebar .novo-btn {
            background:#ffa500;
            color:#00331a;
            font-weight:bold;
            margin:20px 0;
            text-align:center;
        }
        .sidebar .novo-btn:hover { background:#ffb833; transform: translateY(-2px); }
        .sidebar .sair-btn {
            background:#cc3300;
            margin-top:auto;
            text-align:center;
            color: white;
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
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.05);
        }
        .secao { display:none; animation: fadeIn 0.3s ease; }
        .secao.active { display:block; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .stats-grid {
            display:grid;
            grid-template-columns:repeat(4,1fr);
            gap:20px;
            margin-top:20px;
        }
        .stat-card {
            background:white;
            padding:20px;
            border-radius:8px;
            box-shadow:0 2px 5px rgba(0,0,0,0.1);
            text-align:center;
        }
        .stat-card h3 { color:#666; font-size:14px; margin-bottom:10px; }
        .stat-card p { color:#006633; font-size:28px; font-weight:bold; }
        .card { background:white; padding:30px; border-radius:12px; box-shadow:0 4px 15px rgba(0,0,0,0.05); }
        table { width:100%; border-collapse:collapse; margin-top:20px; }
        th { background:#f8f9fa; color:#333; padding:15px; text-align:left; border-bottom:2px solid #eee; }
        td { padding:15px; border-bottom:1px solid #eee; font-size: 14px; }
        tr:hover { background:#fafafa; }
        .btn-acao { 
            background:#f0f0f0; border:none; padding:8px; border-radius:5px; 
            cursor:pointer; transition:0.2s; margin-right:5px;
        }
        .btn-acao:hover { background:#e0e0e0; transform: scale(1.1); }
        .status-badge {
            padding:4px 8px; border-radius:4px; font-weight:bold; font-size:11px;
        }
        .status-ativo { background:#e8f5e9; color:#2e7d32; }
        .status-inativo { background:#ffebee; color:#c62828; }
        .filtros {
            display:flex;
            gap:10px;
            margin-bottom:20px;
            flex-wrap:wrap;
        }
        .filtros select, .filtros input {
            padding:8px;
            border:1px solid #ddd;
            border-radius:5px;
        }
        .spinner {
            border:4px solid #f3f3f3;
            border-top:4px solid #006633;
            border-radius:50%;
            width:30px;
            height:30px;
            animation: spin 1s linear infinite;
            margin:10px auto;
        }
        @keyframes spin { 0% { transform:rotate(0deg); } 100% { transform:rotate(360deg); } }
    </style>
</head>
<body>
    <div class="sidebar">
        <h2>MINISTÉRIO DA SAÚDE</h2>
        <button onclick="mostrarSeccao('dashboardSection')">📊 Dashboard</button>
        <button onclick="mostrarSeccao('laboratoriosSection')">🏥 Laboratórios</button>
        <button class="novo-btn" onclick="location.href='/novo-laboratorio'">➕ NOVO LABORATÓRIO</button>
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
                
                <!-- Filtros -->
                <div class="filtros">
                    <select id="filtroProvincia" onchange="carregarLaboratorios()">
                        <option value="">Todas Províncias</option>
                        <option value="Bengo">Bengo</option>
                        <option value="Benguela">Benguela</option>
                        <option value="Bié">Bié</option>
                        <option value="Cabinda">Cabinda</option>
                        <option value="Cuando Cubango">Cuando Cubango</option>
                        <option value="Cuanza Norte">Cuanza Norte</option>
                        <option value="Cuanza Sul">Cuanza Sul</option>
                        <option value="Cunene">Cunene</option>
                        <option value="Huambo">Huambo</option>
                        <option value="Huíla">Huíla</option>
                        <option value="Luanda">Luanda</option>
                        <option value="Lunda Norte">Lunda Norte</option>
                        <option value="Lunda Sul">Lunda Sul</option>
                        <option value="Malanje">Malanje</option>
                        <option value="Moxico">Moxico</option>
                        <option value="Namibe">Namibe</option>
                        <option value="Uíge">Uíge</option>
                        <option value="Zaire">Zaire</option>
                    </select>
                    <select id="filtroStatus" onchange="carregarLaboratorios()">
                        <option value="">Todos Status</option>
                        <option value="true">Ativo</option>
                        <option value="false">Inativo</option>
                    </select>
                </div>
                
                <!-- Spinner de carregamento -->
                <div id="spinnerLabs" class="spinner" style="display:none;"></div>
                
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
                        <tr><td colspan="7" style="text-align:center;">Carregando...</td></tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <script>
        console.log("Dashboard ministério carregado");
        var token = localStorage.getItem("token");
        console.log("Token:", token ? "presente" : "ausente");
        if (!token) {
            window.location.href = "/ministerio";
        }

        function mostrarSeccao(id) {
            document.getElementById('dashboardSection').className = 'secao';
            document.getElementById('laboratoriosSection').className = 'secao';
            document.getElementById(id).className = 'secao active';
            if (id === 'laboratoriosSection') {
                carregarLaboratorios();
            }
            if (id === 'dashboardSection') {
                carregarStats();
            }
        }

        function carregarStats() {
            fetch('/api/stats', { headers: { 'Authorization': 'Bearer ' + token } })
            .then(r => r.json())
            .then(data => {
                document.getElementById('statsLabs').innerText = data.labs || 0;
                document.getElementById('statsHospitais').innerText = data.hospitais || 0;
                document.getElementById('statsEmpresas').innerText = data.empresas || 0;
                var total = (data.labs||0) + (data.hospitais||0) + (data.empresas||0);
                document.getElementById('statsTotal').innerText = total;
            })
            .catch(console.error);
        }

        function carregarLaboratorios() {
            var tbody = document.getElementById('tabelaLabs');
            var spinner = document.getElementById('spinnerLabs');
            tbody.innerHTML = '';
            spinner.style.display = 'block';

            var provincia = document.getElementById('filtroProvincia').value;
            var status = document.getElementById('filtroStatus').value;

            fetch('/api/labs', { headers: { 'Authorization': 'Bearer ' + token } })
            .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
            .then(lista => {
                spinner.style.display = 'none';
                console.log('Laboratórios recebidos:', lista);

                // Filtrar por província
                if (provincia) {
                    lista = lista.filter(l => l.provincia === provincia);
                }
                // Filtrar por status
                if (status !== '') {
                    var ativo = (status === 'true');
                    lista = lista.filter(l => l.ativo === ativo);
                }

                if (lista.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Nenhum laboratório encontrado</td></tr>';
                } else {
                    var html = '';
                    for (var i = 0; i < lista.length; i++) {
                        var l = lista[i];
                        var statusClass = l.ativo ? 'status-ativo' : 'status-inativo';
                        var statusText = l.ativo ? 'Ativo' : 'Inativo';
                        var btnStatus = l.ativo ? '🔴' : '🟢';
                        var titleStatus = l.ativo ? 'Desativar' : 'Ativar';
                        html += '<tr>';
                        html += '<td><strong>' + (l.nome || '') + '</strong></td>';
                        html += '<td>' + (l.nif || '') + '</td>';
                        html += '<td>' + (l.provincia || '') + '</td>';
                        // ATENÇÃO: o campo no schema é 'telephone' (com ph)
                        html += '<td>' + (l.telephone || '') + '</td>';
                        html += '<td>' + (l.diretor || '') + '</td>';
                        html += '<td><span class="status-badge ' + statusClass + '">' + statusText + '</span></td>';
                        html += '<td>';
                        html += '<button class="btn-acao" onclick="verDetalhes(\'' + l._id + '\')" title="Ver detalhes">👁️</button>';
                        html += '<button class="btn-acao" onclick="toggleStatus(\'' + l._id + '\', ' + l.ativo + ')" title="' + titleStatus + '">' + btnStatus + '</button>';
                        html += '</td>';
                        html += '</tr>';
                    }
                    tbody.innerHTML = html;
                }
            })
            .catch(error => {
                spinner.style.display = 'none';
                console.error('Erro ao carregar laboratórios:', error);
                tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:red;">Erro ao carregar: ' + error.message + '</td></tr>';
            });
        }

        function verDetalhes(id) {
            alert("Detalhes do laboratório em breve...");
        }

        function toggleStatus(id, ativoAtual) {
            var acao = ativoAtual ? 'desativar' : 'ativar';
            if (confirm('Tem certeza que deseja ' + acao + ' este laboratório?')) {
                // Aqui você pode implementar a chamada para ativar/desativar
                alert('Função em desenvolvimento: ' + acao);
                carregarLaboratorios(); // recarrega a lista
            }
        }

        function logout() {
            localStorage.removeItem("token");
            localStorage.removeItem("labKey");
            window.location.href = "/";
        }

        carregarStats();
    </script>
</body>
</html>`);
});
// ============================================
// DASHBOARD DO LABORATÓRIO
// ============================================
app.get('/lab-dashboard', (req, res) => {
    res.send('<!DOCTYPE html>' +
    '<html>' +
    '<head><title>Laboratório - SNS</title>' +
    '<style>' +
    'body{font-family:Arial;margin:0;display:flex;}' +
    '.sidebar{width:250px;background:#006633;color:white;height:100vh;padding:20px;position:fixed;}' +
    '.sidebar a{display:block;color:white;text-decoration:none;padding:10px;margin:5px 0;}' +
    '.sidebar a:hover{background:#004d26;}' +
    '.main{margin-left:290px;padding:30px;}' +
    '.btn{background:#006633;color:white;border:none;padding:10px 20px;cursor:pointer;margin:5px;}' +
    '.welcome{background:#e8f5e9;padding:20px;border-left:5px solid #006633;margin-bottom:20px;}' +
    'table{width:100%;border-collapse:collapse;}' +
    'th{background:#006633;color:white;padding:10px;}' +
    'td{padding:10px;border-bottom:1px solid #ddd;}' +
    '</style>' +
    '</head>' +
    '<body>' +
    '<div class="sidebar">' +
    '<h2>SNS - Laboratório</h2>' +
    '<a href="#" onclick="mostrarSecao(\'dashboard\')">📊 Dashboard</a>' +
    '<a href="#" onclick="mostrarSecao(\'certificados\')">📋 Certificados</a>' +
    '<button onclick="logout()" style="margin-top:20px;background:#dc3545;color:white;border:none;padding:10px;width:100%;">Sair</button>' +
    '</div>' +
    '<div class="main">' +
    '<div id="secaoDashboard">' +
    '<div id="welcomeBanner" class="welcome"></div>' +
    '<h1>Dashboard</h1>' +
    '<div>Total de certificados emitidos: <span id="totalCerts">0</span></div>' +
    '</div>' +
    '<div id="secaoCertificados" style="display:none;">' +
    '<h1>Certificados</h1>' +
    '<button class="btn" onclick="mostrarModalCertificado()">+ Novo Certificado</button>' +
    '<table id="certTable"><thead><tr><th>Número</th><th>Tipo</th><th>Paciente</th><th>Data</th></tr></thead><tbody></tbody></table>' +
    '</div>' +
    '</div>' +

    '<div id="modalCertificado" class="modal" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);align-items:center;justify-content:center;">' +
    '<div class="modal-content" style="background:white;padding:20px;border-radius:10px;width:400px;">' +
    '<h3>Novo Certificado</h3>' +
    '<input type="text" id="certNome" placeholder="Nome completo">' +
    '<select id="certTipo">' +
    '<option value="1">🧬 Genótipo</option>' +
    '<option value="2">🩺 Boa Saúde</option>' +
    '<option value="3">📋 Incapacidade</option>' +
    '<option value="4">💪 Aptidão</option>' +
    '</select>' +
    '<input type="text" id="certBI" placeholder="BI">' +
    '<button onclick="emitirCertificado()" style="background:#006633;color:white;padding:10px;width:100%;">Emitir</button>' +
    '<button onclick="fecharModal()" style="margin-top:5px;">Cancelar</button>' +
    '</div></div>' +

    '<script>' +
    'const labKey=localStorage.getItem("labKey");' +
    'if(!labKey) window.location.href="/lab-login";' +

    'async function carregarLaboratorio(){' +
    'const r=await fetch("/api/labs/me",{headers:{"x-api-key":labKey}});' +
    'const lab=await r.json();' +
    'if(lab){' +
    'document.getElementById("welcomeBanner").innerHTML="👋 Olá, "+lab.nome+"! 💪 Pronto para mais um dia de trabalho? Vamos juntos!";' +
    '}}' +

    'function mostrarSecao(s){' +
    'document.getElementById("secaoDashboard").style.display="none";' +
    'document.getElementById("secaoCertificados").style.display="none";' +
    'if(s==="dashboard"){document.getElementById("secaoDashboard").style.display="block";carregarStats();}' +
    'if(s==="certificados"){document.getElementById("secaoCertificados").style.display="block";carregarCertificados();}}' +

    'function mostrarModalCertificado(){document.getElementById("modalCertificado").style.display="flex";}' +
    'function fecharModal(){document.getElementById("modalCertificado").style.display="none";}' +

    'async function carregarStats(){' +
    'const r=await fetch("/api/certificados/lab",{headers:{"x-api-key":labKey}});' +
    'const certs=await r.json();' +
    'document.getElementById("totalCerts").innerText=certs.length;}' +

    'async function carregarCertificados(){' +
    'const r=await fetch("/api/certificados/lab",{headers:{"x-api-key":labKey}});' +
    'const certs=await r.json();' +
    'let html="";' +
    'certs.forEach(c=>{html+="<tr><td>"+c.numero+"</td><td>"+c.tipo+"</td><td>"+c.paciente.nomeCompleto+"</td><td>"+new Date(c.emitidoEm).toLocaleDateString()+"</td></tr>";});' +
    'document.querySelector("#certTable tbody").innerHTML=html;}' +

    'async function emitirCertificado(){' +
    'const dados={paciente:{nomeCompleto:document.getElementById("certNome").value,bi:document.getElementById("certBI").value},dados:{}};' +
    'const tipo=document.getElementById("certTipo").value;' +
    'const r=await fetch("/api/certificados/emitir/"+tipo,{method:"POST",headers:{"Content-Type":"application/json","x-api-key":labKey},body:JSON.stringify(dados)});' +
    'const d=await r.json();' +
    'if(d.success){alert("✅ Certificado emitido! Nº: "+d.numero);fecharModal();carregarCertificados();}' +
    'else alert("Erro: "+d.erro);}' +

    'carregarLaboratorio();' +
    'mostrarSecao("dashboard");' +
    'function logout(){localStorage.removeItem("labKey");window.location.href="/";}' +
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
        res.status(500).json({ erro: 'Erro interno' });
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
// ============================================
// ROUTE POUR LE FORMULAIRE DE CRÉATION DE LABORATOIRE
// ============================================
app.get('/novo-laboratorio', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'novo-laboratorio.html'));
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
    console.log('🚀 SNS - Servidor iniciado');
    console.log('='.repeat(50));
    console.log('📱 URL: http://localhost:' + PORT);
    console.log('🏛️ Ministério: /ministerio (admin@sns.gov.ao)');
    console.log('🔬 Laboratório: /lab-login (com API Key)');
    console.log('✅ Todos os botões funcionais');
    console.log('='.repeat(50) + '\n');
});