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

// ============================================
// ============================================
// DASHBOARD DO MINISTÉRIO (CORRIGIDO E COMPLETO)
// ============================================
app.get('/admin-dashboard', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="pt">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SNS - Ministério da Saúde</title>
    <style>
        :root {--primary: #006633; --bg: #f4f7f6; --text: #333; }
        * { margin:0; padding:0; box-sizing:border-box; font-family: "Segoe UI", sans-serif; }
        body { display: flex; background: var(--bg); min-height: 100vh; color: var(--text); }
        .sidebar { width: 260px; background: var(--primary); color: white; position: fixed; height: 100vh; padding: 20px; display: flex; flex-direction: column; box-shadow: 2px 0 10px rgba(0,0,0,0.1); }
        .sidebar h2 { font-size: 18px; text-align: center; padding-bottom: 20px; border-bottom: 1px solid rgba(255,255,255,0.1); margin-bottom: 20px; letter-spacing: 1px; }
        .sidebar button { background: none; border: none; color: rgba(255,255,255,0.8); padding: 15px; text-align: left; width: 100%; cursor: pointer; border-radius: 8px; font-size: 15px; transition: 0.3s; margin-bottom: 5px; }
        .sidebar button:hover { background: rgba(255,255,255,0.1); color: white; }
        .sidebar button.active { background: rgba(255,255,255,0.2); color: white; font-weight: bold; }
        .logout-btn { margin-top: auto; background: #c0392b !important; color: white !important; text-align: center !important; }
        .main { margin-left: 260px; padding: 40px; width: calc(100% - 260px); }
        .header-flex { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }
        .stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 30px; }
        .stat-card { background: white; padding: 25px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); text-align: center; border-top: 4px solid var(--primary); }
        .stat-card h3 { font-size: 13px; color: #777; text-transform: uppercase; margin-bottom: 10px; }
        .stat-card p { font-size: 32px; font-weight: bold; color: var(--primary); }
        .card-table { background: white; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); padding: 20px; overflow-x: auto; }
        table { width: 100%; border-collapse: collapse; }
        th { text-align: left; padding: 15px; border-bottom: 2px solid #eee; color: #555; font-size: 14px; }
        td { padding: 15px; border-bottom: 1px solid #eee; font-size: 14px; }
        tr:hover { background: #f9f9f9; }
        .btn-acao { background: #f0f0f0; border: none; padding: 8px; border-radius: 5px; cursor: pointer; transition: 0.2s; margin-right: 5px; font-size: 16px; }
        .btn-acao:hover { background: #e0e0e0; transform: scale(1.1); }
        .btn-add { background: var(--primary); color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-weight: bold; transition: 0.2s; }
        .btn-add:hover { transform: translateY(-2px); box-shadow: 0 5px 15px rgba(0,102,51,0.3); }
        .modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); align-items: center; justify-content: center; z-index: 2000; backdrop-filter: blur(4px); }
        .modal-content { background: white; padding: 30px; border-radius: 15px; width: 750px; max-height: 90vh; overflow-y: auto; }
        .campo { margin-bottom: 15px; }
        .campo label { display: block; font-weight: bold; margin-bottom: 5px; font-size: 13px; color: #555; }
        .campo input, .campo select { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; }
        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
    </style>
</head>
<body>
    <div class="sidebar">
        <h2>SNS - MINISTÉRIO</h2>
        <button id="btn-dash" onclick="showTab('dash')" class="active">📊 Dashboard</button>
        <button id="btn-labs" onclick="showTab('labs')">🔬 Laboratórios</button>
        <button class="logout-btn" onclick="logout()">🚪 Sair</button>
    </div>

    <div class="main">
        <div id="sec-dash" class="section">
            <div class="header-flex"><h1>Dashboard Geral</h1></div>
            <div class="stats-grid">
                <div class="stat-card"><h3>Laboratórios</h3><p id="countLabs">0</p></div>
                <div class="stat-card"><h3>Hospitais</h3><p>0</p></div>
                <div class="stat-card"><h3>Empresas</h3><p>0</p></div>
            </div>
        </div>

        <div id="sec-labs" class="section" style="display:none;">
            <div class="header-flex">
                <h2>Laboratórios Registados</h2>
                <button class="btn-add" onclick="openModal('modalLab')">➕ Novo Laboratório</button>
            </div>
            <div class="card-table">
                <table>
                    <thead>
                        <tr>
                            <th>Nome</th>
                            <th>NIF</th>
                            <th>Província</th>
                            <th>Status</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody id="tableLabs"></tbody>
                </table>
            </div>
        </div>
    </div>

    <div id="modalLab" class="modal">
        <div class="modal-content">
            <div id="formCorpo">
                <h2 style="margin-bottom:20px; color:var(--primary)">Registar Laboratório</h2>
                <div class="grid-2">
                    <div class="campo" style="grid-column: span 2;"><label>Nome *</label><input type="text" id="labNome"></div>
                    <div class="campo"><label>NIF *</label><input type="text" id="labNIF" maxlength="10"></div>
                    <div class="campo">
                        <label>Província *</label>
                        <select id="labProvincia">
                            <option value="">Selecione</option>
                            <option value="Bengo">Bengo</option><option value="Benguela">Benguela</option>
                            <option value="Bié">Bié</option><option value="Cabinda">Cabinda</option>
                            <option value="Cuando Cubango">Cuando Cubango</option><option value="Cuanza Norte">Cuanza Norte</option>
                            <option value="Cuanza Sul">Cuanza Sul</option><option value="Cunene">Cunene</option>
                            <option value="Huambo">Huambo</option><option value="Huíla">Huíla</option>
                            <option value="Luanda">Luanda</option><option value="Lunda Norte">Lunda Norte</option>
                            <option value="Lunda Sul">Lunda Sul</option><option value="Malanje">Malanje</option>
                            <option value="Moxico">Moxico</option><option value="Namibe">Namibe</option>
                            <option value="Uíge">Uíge</option><option value="Zaire">Zaire</option>
                        </select>
                    </div>
                </div>
                <div style="margin-top:20px; display:flex; gap:10px;">
                    <button class="btn-add" style="flex:2" onclick="salvarLaboratorio()">✅ Confirmar Registo</button>
                    <button onclick="closeModal('modalLab')" style="flex:1; border:none; border-radius:8px; cursor:pointer;">Cancelar</button>
                </div>
            </div>
        </div>
    </div>

    <script>
        const token = localStorage.getItem("token");
        if (!token) window.location.href = "/ministerio";

        function showTab(tab) {
            document.querySelectorAll(".section").forEach(s => s.style.display = "none");
            document.querySelectorAll(".sidebar button").forEach(b => b.classList.remove("active"));
            document.getElementById("sec-" + tab).style.display = "block";
            document.getElementById("btn-" + tab).classList.add("active");
            if (tab === "dash") loadStats();
            if (tab === "labs") loadLabs();
        }

        function openModal(id) { document.getElementById(id).style.display = "flex"; }
        function closeModal(id) { document.getElementById(id).style.display = "none"; }

        async function loadStats() {
            try {
                const r = await fetch("/api/stats", { headers: { "Authorization": "Bearer " + token } });
                const d = await r.json();
                document.getElementById("countLabs").innerText = d.labs || 0;
            } catch(e) { console.error(e); }
        }

        async function loadLabs() {
            try {
                const r = await fetch("/api/labs", { headers: { "Authorization": "Bearer " + token } });
                const labs = await r.json();
                const tbody = document.getElementById("tableLabs");
                tbody.innerHTML = labs.map(l => \`
                    <tr>
                        <td><strong>\${l.nome}</strong></td>
                        <td>\${l.nif}</td>
                        <td>\${l.provincia}</td>
                        <td><span style="color:\${l.ativo ? 'green' : 'red'}">\${l.ativo ? 'Ativo' : 'Inativo'}</span></td>
                        <td>
                            <button class="btn-acao" onclick="acaoPDF('\${l._id}', 'view')" title="Ver">👁️</button>
                            <button class="btn-acao" onclick="acaoPDF('\${l._id}', 'print')" title="Imprimir">🖨️</button>
                            <button class="btn-acao" onclick="acaoPDF('\${l._id}', 'download')" title="Baixar">📥</button>
                        </td>
                    </tr>
                \`).join("");
            } catch(e) { console.error(e); }
        }

        async function acaoPDF(id, acao) {
            try {
                const r = await fetch("/api/labs", { headers: { "Authorization": "Bearer " + token } });
                const labs = await r.json();
                const lab = labs.find(item => item._id === id);
                
                const res = await fetch("/api/labs/pdf", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
                    body: JSON.stringify(lab)
                });
                
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                
                if(acao === 'view') window.open(url, "_blank");
                if(acao === 'download') {
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = \`Lab_\${lab.nome}.pdf\`;
                    a.click();
                }
                if(acao === 'print') {
                    const win = window.open(url, "_blank");
                    win.onload = () => win.print();
                }
            } catch(e) { alert("Erro ao processar PDF"); }
        }

        async function salvarLaboratorio() {
            const dados = {
                nome: document.getElementById("labNome").value,
                nif: document.getElementById("labNIF").value,
                provincia: document.getElementById("labProvincia").value,
                ativo: true
            };

            if(!dados.nome || !dados.nif) return alert("Preencha os campos obrigatórios");

            try {
                const r = await fetch("/api/labs", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
                    body: JSON.stringify(dados)
                });
                const res = await r.json();
                if(res.success) {
                    alert("Laboratório registado!");
                    closeModal("modalLab");
                    loadLabs();
                } else {
                    alert("Erro ao salvar");
                }
            } catch(e) { alert("Erro de conexão"); }
        }

        function logout() { localStorage.clear(); window.location.href = "/"; }
        window.onload = loadStats;
    </script>
</body>
</html>
`);
});


// DASHBOARD DO LABORATORIO (TOUS BOUTONS ACTIFS)
// ================================================
app.get('/lab-dashboard', (req, res) => {
    res.send(`<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Laboratório - SNS</title>
    <style>
        * { margin:0; padding:0; box-sizing:border-box; font-family: 'Segoe UI', Arial, sans-serif; }
        body { display:flex; background:#f5f5f5; min-height: 100vh; }
        
        /* Sidebar Estilizada */
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

        /* Área Principal */
        .main { margin-left:260px; padding:40px; width:100%; }
        .welcome {
            background:white;
            padding:25px;
            border-left:6px solid #006633;
            margin-bottom:30px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.05);
        }
        
        /* Controle de Seções */
        .secao { display:none; animation: fadeIn 0.3s ease; }
        .secao.active { display:block; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

        /* Tabelas e Botões */
        .card { background:white; padding:30px; border-radius:12px; box-shadow:0 4px 15px rgba(0,0,0,0.05); }
        table { width:100%; border-collapse:collapse; margin-top:10px; }
        th { background:#f8f9fa; color:#333; padding:15px; text-align:left; border-bottom:2px solid #eee; }
        td { padding:15px; border-bottom:1px solid #eee; font-size: 14px; }
        tr:hover { background:#fafafa; }
        
        .btn-acao { 
            background:#f0f0f0; border:none; padding:8px; border-radius:5px; 
            cursor:pointer; transition:0.2s; margin-right:5px;
        }
        .btn-acao:hover { background:#e0e0e0; transform: scale(1.1); }
        
        .status-badge {
            background: #e8f5e9; color: #2e7d32; padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 11px;
        }
    </style>
</head>
<body>
    <div class="sidebar">
        <h2>SNS - LABORATÓRIO</h2>
        <button onclick="mostrarSeccion('dashboardSection')">📊 Dashboard</button>
        <button onclick="mostrarSeccion('certificadosSection')">📋 Histórico</button>
        <button class="novo-btn" onclick="location.href='/novo-certificado'">➕ NOVO CERTIFICADO</button>
        <button class="sair-btn" onclick="logout()">🚪 Sair</button>
    </div>
    
    <div class="main">
        <div id="welcome" class="welcome"><h2>Carregando...</h2></div>
        
        <div id="dashboardSection" class="secao active">
            <div class="card">
                <h3>📊 Estatísticas e Visão Geral</h3>
                <p style="margin-top:15px; color:#666;">Selecione uma opção no menu lateral para gerenciar os certificados do Sistema Nacional de Saúde.</p>
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
                    <tbody id="tabela">
                        <tr><td colspan="5" style="text-align:center;">Carregando registros...</td></tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <script>
        const key = localStorage.getItem("labKey");
        if (!key) window.location.href = "/lab-login";

        // Types mis à jour selon vos besoins
        const tipos = ["", "GENÓTIPO", "BOA SAÚDE", "INCAPACIDADE", "APTIDÃO", "SAÚDE MATERNA", "PRÉ-NATAL", "EPIDEMIOLÓGICO", "CSD"];

        function mostrarSeccion(id) {
            document.querySelectorAll('.secao').forEach(s => s.classList.remove('active'));
            document.getElementById(id).classList.add('active');
            if(id === 'certificadosSection') carregarCertificados();
        }

        async function carregarDados() {
            try {
                const r = await fetch("/api/labs/me", { headers: { "x-api-key": key } });
                const data = await r.json();
                document.getElementById("welcome").innerHTML = "<h2>👋 Olá, " + data.nome + "</h2><p>Laboratório Autorizado pelo Ministério da Saúde</p>";
            } catch (e) { console.error(e); }
        }

        async function carregarCertificados() {
            const tbody = document.getElementById("tabela");
            try {
                const r = await fetch("/api/certificados/lab", { headers: { "x-api-key": key } });
                const lista = await r.json();
                
                if (!lista || lista.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:40px;">Nenhum certificado emitido ainda.</td></tr>';
                    return;
                }

                tbody.innerHTML = lista.map(c => \`
                    <tr>
                        <td><strong>\${c.numero}</strong></td>
                        <td><span class="status-badge">\${tipos[c.tipo] || 'OUTRO'}</span></td>
                        <td>\${c.paciente?.nomeCompleto || 'N/I'}</td>
                        <td>\${new Date(c.emitidoEm).toLocaleDateString('pt-PT')}</td>
                        <td>
                            <button class="btn-acao" onclick="gerarPDF('\${c.numero}', 'view')" title="Visualizar">👁️</button>
                            <button class="btn-acao" onclick="gerarPDF('\${c.numero}', 'print')" title="Imprimir">🖨️</button>
                            <button class="btn-acao" onclick="gerarPDF('\${c.numero}', 'download')" title="Baixar">📥</button>
                        </td>
                    </tr>
                \`).join('');
            } catch (e) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:red;">Erro ao carregar dados.</td></tr>';
            }
        }

        async function gerarPDF(numero, acao) {
            try {
                const res = await fetch('/api/certificados/pdf', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-api-key': key },
                    body: JSON.stringify({ numero })
                });

                if (!res.ok) throw new Error();
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);

                if (acao === 'view') window.open(url, '_blank');
                if (acao === 'download') {
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = \`Certificado-\${numero}.pdf\`;
                    a.click();
                }
                if (acao === 'print') {
                    const win = window.open(url, '_blank');
                    win.onload = () => win.print();
                }
            } catch (e) { alert("Erro ao processar PDF"); }
        }

        function logout() {
            localStorage.removeItem("labKey");
            window.location.href = "/";
        }

        // Initialisation
        carregarDados();
    </script>
</body>
</html>`);
});

// ==============================================
// ==============================================
// ROTAS DA API (ACTUALIZADAS)
// ==============================================

// Rota para obter dados do laboratório atual
app.get('/api/labs/me', labMiddleware, async (req, res) => {
    res.json(req.lab);
});

// Criar novo laboratório (apenas admin)
app.post('/api/labs', authMiddleware, async (req, res) => {
    try {
        const dados = req.body;
        const labId = 'LAB' + Date.now();
        const apiKey = gerarApiKey();
        const lab = new Lab({ ...dados, labId, apiKey });
        await lab.save();
        res.json({ success: true, labId, apiKey });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao criar laboratório' });
    }
});

// ============================================================
// MODIFICATION ICI : Listar todos os laboratórios (apenas admin)
// On retire { apiKey: 0 } pour permettre la génération du PDF complet
// ============================================================
app.get('/api/labs', authMiddleware, async (req, res) => {
    try {
        // Modification : On récupère TOUS les champs, y compris l'apiKey
        const labs = await Lab.find({}).sort({ createdAt: -1 });
        res.json(labs);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao listar laboratórios' });
    }
});

// Stats detalhados para laboratório
app.get('/api/certificados/stats-detalhes', labMiddleware, async (req, res) => {
    try {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        
        const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        const inicioAno = new Date(hoje.getFullYear(), 0, 1);
        
        const stats = await Certificate.aggregate([
            { $match: { emitidoPor: req.lab._id } },
            {
                $facet: {
                    diario: [
                        { $match: { emitidoEm: { $gte: hoje } } },
                        { $count: "count" }
                    ],
                    mensal: [
                        { $match: { emitidoEm: { $gte: inicioMes } } },
                        { $count: "count" }
                    ],
                    anual: [
                        { $match: { emitidoEm: { $gte: inicioAno } } },
                        { $count: "count" }
                    ],
                    porTipo: [
                        { $group: { _id: "$tipo", count: { $sum: 1 } } }
                    ]
                }
            }
        ]);
        
        res.json({
            diario: stats[0]?.diario[0]?.count || 0,
            mensal: stats[0]?.mensal[0]?.count || 0,
            anual: stats[0]?.anual[0]?.count || 0,
            total: req.lab.totalEmissoes,
            porTipo: stats[0]?.porTipo || []
        });
    } catch (error) {
        console.error('Erro stats:', error);
        res.status(500).json({ error: 'Erro ao calcular estatísticas' });
    }
});

// Listar certificados do laboratório
app.get('/api/certificados/lab', labMiddleware, async (req, res) => {
    try {
        const certificados = await Certificate.find({ emitidoPor: req.lab._id })
            .sort({ emitidoEm: -1 });
        res.json(certificados);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao listar certificados' });
    }
});

// Emitir novo certificado
app.post('/api/certificados/emitir/:tipo', labMiddleware, async (req, res) => {
    try {
        const tipo = parseInt(req.params.tipo);
        const dados = req.body;
        const numero = gerarNumeroCertificado(tipo);
        const hash = crypto.createHash('sha256').update(numero + Date.now()).digest('hex');
        
        const certificado = new Certificate({
            numero,
            tipo,
            paciente: dados.paciente,
            laborantin: dados.laborantin,
            dados: dados.dados,
            hash,
            emitidoPor: req.lab._id
        });
        
        await certificado.save();
        
        req.lab.totalEmissoes++;
        await req.lab.save();
        
        res.json({ 
            success: true, 
            numero,
            imc: certificado.imc,
            idade: certificado.idade,
            classificacaoIMC: certificado.classificacaoIMC
        });
    } catch (error) {
        console.error('Erro emissão:', error);
        res.status(500).json({ error: error.message });
    }
});


// =============================================
// ROUTE POUR GÉNÉRER LES PDF
// =============================================
app.post('/api/certificados/pdf', labMiddleware, async (req, res) => {
    try {
        const { numero } = req.body;
        
        // Vérifier que le numéro est présent
        if (!numero) {
            return res.status(400).json({ error: 'Número do certificado não fornecido' });
        }
        
        // Récupérer le certificat avec les données
        const certificado = await Certificate.findOne({ 
            numero,
            emitidoPor: req.lab._id 
        });
        
        if (!certificado) {
            return res.status(404).json({ error: 'Certificado não encontrado' });
        }
        
        // Utiliser la méthode de l'instance pour préparer les données
        const dados = certificado.prepararParaPDF ? certificado.prepararParaPDF() : {
            numero: certificado.numero,
            tipo: certificado.tipo,
            paciente: certificado.paciente,
            laborantin: certificado.laborantin || { nome: 'Não informado', registro: '' },
            dados: certificado.dados,
            imc: certificado.imc,
            idade: certificado.idade,
            classificacaoIMC: certificado.classificacaoIMC,
            emitidoEm: certificado.emitidoEm
        };
        
        const lab = req.lab;
        
        // Créer un nouveau document PDF
        const doc = new PDFDocument({
            size: 'A4',
            margin: 50,
            info: {
                Title: `Certificado ${numero}`,
                Author: lab.nome,
                Subject: 'Certificado Médico SNS Angola'
            }
        });
        
        // Configurer la réponse
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=certificado-${numero}.pdf`);
        
        // Pipe le PDF vers la réponse
        doc.pipe(res);
        
        // =========================================
        // EN-TÊTE DU DOCUMENT (CENTRÉ)
        // =========================================
        doc.fillColor('#006633');

        // Première ligne - centrée
        doc.fontSize(20)
           .text('REPÚBLICA DE ANGOLA', 0, 50, { align: 'center' });

        // Deuxième ligne - centrée
        doc.fontSize(16)
           .text('MINISTÉRIO DA SAÚDE', 0, 80, { align: 'center' });

        // Troisième ligne - centrée et plus grande
        doc.fontSize(24)
           .text('SISTEMA NACIONAL DE SAÚDE', 0, 110, { align: 'center' });

        // Ligne de séparation centrée
        doc.strokeColor('#006633')
           .lineWidth(2)
           .moveTo(doc.page.width / 2 - 250, 150)
           .lineTo(doc.page.width / 2 + 250, 150)
           .stroke();

        let y = 180;
        
        // =========================================
        // LABORATÓRIO EMISSOR
        // =========================================
        doc.fillColor('#006633')
            .fontSize(14)
            .text(lab.nome, 50, y);

        doc.fontSize(10)
            .fillColor('#666')
            .text(`NIF: ${lab.nif} | ${lab.provincia}`, 50, y + 20)
            .text(`Endereço: ${lab.endereco || 'Não informado'} | Tel: ${lab.telephone || 'Não informado'}`, 50, y + 35);

        y += 60;
        
        // =========================================
        // NUMÉRO DO CERTIFICADO
        // =========================================
        doc.fillColor('#006633')
            .fontSize(12)
            .text(`CERTIFICADO Nº: ${numero}`, 50, y);

        doc.fontSize(10)
            .fillColor('#666')
            .text(`Data de Emissão: ${new Date(dados.emitidoEm).toLocaleDateString('pt-PT')}`, 50, y + 15);

        y += 40;
        
        // =========================================
        // RESPONSÁVEL PELA EMISSÃO (LABORANTIN)
        // =========================================
        doc.fillColor('#006633')
            .fontSize(12)
            .text('RESPONSÁVEL PELA EMISSÃO:', 50, y);
        
        y += 20;
        doc.fillColor('#000')
            .fontSize(11)
            .text(`Nome: ${dados.laborantin?.nome || 'Não informado'}`, 70, y);
        y += 15;
        
        if (dados.laborantin?.registro) {
            doc.text(`Registro Profissional: ${dados.laborantin.registro}`, 70, y);
            y += 25;
        } else {
            y += 10;
        }
        
        // =========================================
        // DADOS DO PACIENTE
        // =========================================
        doc.fillColor('#006633')
            .fontSize(12)
            .text('DADOS DO PACIENTE:', 50, y);
        
        y += 20;
        doc.fillColor('#000')
            .fontSize(11)
            .text(`Nome: ${dados.paciente?.nomeCompleto || 'Não informado'}`, 70, y);
        y += 15;
        doc.text(`BI: ${dados.paciente?.bi || 'Não informado'}`, 70, y);
        y += 15;
        
        if (dados.paciente?.dataNascimento) {
            doc.text(`Data Nascimento: ${new Date(dados.paciente.dataNascimento).toLocaleDateString('pt-PT')}`, 70, y);
            y += 15;
        }
        
        if (dados.idade) {
            doc.text(`Idade: ${dados.idade} anos`, 70, y);
            y += 15;
        }
        
        if (dados.paciente?.genero) {
            const genero = dados.paciente.genero === 'M' ? 'Masculino' : 'Feminino';
            doc.text(`Género: ${genero}`, 70, y);
            y += 15;
        }
        
        if (dados.paciente?.telefone) {
            doc.text(`Telefone: ${dados.paciente.telefone}`, 70, y);
            y += 20;
        }
        
        // =========================================
        // DADOS MÉDICOS (AVEC "NÃO SOLICITADO")
        // =========================================
        doc.fillColor('#006633')
            .fontSize(12)
            .text('DADOS MÉDICOS:', 50, y);
        
        y += 20;
        
        // Titre du type de certificat
        const tipos = {
            1: 'CERTIFICADO DE GENÓTIPO',
            2: 'CERTIFICADO DE BOA SAÚDE',
            3: 'CERTIFICADO DE INCAPACIDADE',
            4: 'CERTIFICADO DE APTIDÃO',
            5: 'CERTIFICADO DE SAÚDE MATERNA',
            6: 'CERTIFICADO DE PRÉ-NATAL',
            7: 'CERTIFICADO EPIDEMIOLÓGICO',
            8: 'CERTIFICADO DE SAÚDE PARA DESLOCAÇÃO (CSD)'
        };
        
        doc.fillColor('#333')
            .fontSize(12)
            .text(tipos[dados.tipo] || 'CERTIFICADO MÉDICO', 70, y);
        
        y += 25;
        
        if (dados.dados) {
            // Liste de tous les examens possibles pour ce type de certificat
            const todosExames = {
                1: ['grupoSanguineo', 'fatorRh', 'genotipo', 'hemoglobina', 'hematocrito', 'contagem_reticulocitos', 'eletroforese'],
                2: ['peso', 'altura', 'pressaoArterial', 'frequenciaCardiaca', 'frequenciaRespiratoria', 'temperatura', 'saturacaoOxigenio', 'glicemia', 'colesterolTotal', 'triglicerideos'],
                3: ['tipoIncapacidade', 'causa', 'grau', 'dataInicio', 'partesAfetadas', 'limitacoes', 'necessitaAcompanhante'],
                4: ['tipoAptidao', 'modalidade', 'resultado', 'restricoes', 'validade'],
                5: ['gestacoes', 'partos', 'abortos', 'nascidosVivos', 'dum', 'dpp', 'idadeGestacional', 'consultasCPN', 'hemograma', 'gotaEspessa', 'hiv', 'vdrl', 'hbs', 'glicemia', 'creatinina', 'ureia', 'tgo', 'grupoSanguineo', 'fatorRh', 'exsudadoVaginal', 'pesoAtual', 'alturaUterina', 'batimentosCardiacosFeto', 'movimentosFetais', 'edema', 'proteinuria'],
                6: ['grupoSanguineo', 'fatorRh', 'hemograma', 'gotaEspessa', 'hiv', 'vdrl', 'hbs', 'vidal', 'glicemia', 'creatinina', 'ureia', 'tgo', 'testeGravidez', 'exsudadoVaginal', 'vs', 'falsiformacao'],
                7: ['doenca', 'outraDoenca', 'dataInicioSintomas', 'dataDiagnostico', 'metodoDiagnostico', 'tipoExame', 'resultado', 'tratamento', 'internamento', 'dataInternamento', 'contatos'],
                8: ['destino', 'motivoViagem', 'dataPartida', 'dataRetorno', 'vacinaFebreAmarela', 'dataVacinaFebreAmarela', 'loteVacinaFebreAmarela', 'vacinaCovid19', 'dosesCovid', 'testeCovid', 'tipoTesteCovid', 'dataTesteCovid', 'resultadoTesteCovid', 'outrasVacinas', 'medicamentos', 'condicoesEspeciais', 'recomendacoes']
            };
            
            const examesTipo = todosExames[dados.tipo] || [];
            
            // Préparer tous les examens avec leur statut
            const todosExamesFormatados = [];
            
            for (let i = 0; i < examesTipo.length; i++) {
                const exame = examesTipo[i];
                
                const nomeExame = exame.replace(/([A-Z])/g, ' $1')
                    .replace(/^./, function(str) { return str.toUpperCase(); });
                
                const valor = dados.dados[exame];
                
                if (valor && valor.toString().trim() !== '') {
                    // Examen rempli
                    todosExamesFormatados.push({
                        exame: nomeExame,
                        valor: valor,
                        solicitado: true
                    });
                } else {
                    // Examen non sollicité
                    todosExamesFormatados.push({
                        exame: nomeExame,
                        valor: '(não solicitado)',
                        solicitado: false
                    });
                }
            }
            
            // Afficher tous les examens en 2 colonnes
            if (todosExamesFormatados.length > 0) {
                const metade = Math.ceil(todosExamesFormatados.length / 2);
                
                doc.fontSize(9);
                
                // Colonne 1
                let yCol1 = y;
                for (let j = 0; j < metade; j++) {
                    const item = todosExamesFormatados[j];
                    if (item.solicitado) {
                        doc.fillColor('#000')
                           .text(`• ${item.exame}: ${item.valor}`, 70, yCol1);
                    } else {
                        doc.fillColor('#999')
                           .text(`• ${item.exame}: ${item.valor}`, 70, yCol1);
                    }
                    yCol1 += 15;
                    
                    if (yCol1 > 700) {
                        doc.addPage();
                        yCol1 = 50;
                    }
                }
                
                // Colonne 2
                let yCol2 = y;
                for (let j = metade; j < todosExamesFormatados.length; j++) {
                    const item = todosExamesFormatados[j];
                    if (item.solicitado) {
                        doc.fillColor('#000')
                           .text(`• ${item.exame}: ${item.valor}`, 300, yCol2);
                    } else {
                        doc.fillColor('#999')
                           .text(`• ${item.exame}: ${item.valor}`, 300, yCol2);
                    }
                    yCol2 += 15;
                    
                    if (yCol2 > 700) {
                        doc.addPage();
                        yCol2 = 50;
                    }
                }
                
                y = (yCol1 > yCol2 ? yCol1 : yCol2) + 10;
            }
        }
        
        if (dados.imc) {
            doc.fontSize(11)
                .fillColor('#000')
                .text(`IMC: ${dados.imc} (${dados.classificacaoIMC || 'Não classificado'})`, 70, y);
            y += 25;
        }
        
        // =========================================
                // =========================================
               // =========================================
        // ASSINATURAS
        // =========================================
        // Linha para assinatura do laborantin
        doc.lineWidth(1)
            .moveTo(70, y)
            .lineTo(270, y)
            .stroke();
        
        doc.fontSize(10)
            .text('Assinatura do Laborantin', 70, y + 5)
            .text(dados.laborantin?.nome || '___________________', 70, y + 20);
        
        // Linha para assinatura do diretor
        doc.lineWidth(1)
            .moveTo(350, y)
            .lineTo(550, y)
            .stroke();
        
        doc.fontSize(10)
            .text('Assinatura do Diretor Clínico', 350, y + 5)
            .text(lab.diretor || '___________________', 350, y + 20);
        
        y += 50;
        
        // =========================================
        // QR CODE DE VERIFICAÇÃO (CENTRADO COM AWAIT)
        // =========================================
        try {
            // Données simplifiées pour le QR code
            const textoQR = `${numero}|${lab.nome}|${dados.paciente?.nomeCompleto || 'PACIENTE'}|${new Date(dados.emitidoEm).toLocaleDateString('pt-PT')}`;
            
            // 👇 ATTENDRE que le QR soit généré (CRITIQUE)
            const qrBuffer = await QRCode.toBuffer(textoQR, {
                errorCorrectionLevel: 'H',
                margin: 1,
                width: 100,
                color: { dark: '#006633', light: '#FFFFFF' }
            });
            
            // Position CENTRÉE (entre les deux signatures)
            const qrX = 310 - 50; // Centre (310) - moitié du QR (50)
            const qrY = y - 20;   // Position verticale
            
            // Afficher le QR code
            doc.image(qrBuffer, qrX, qrY, { width: 100 });
            
            // Texte au-dessus
            doc.fontSize(7)
               .fillColor('#006633')
               .text('SCAN PARA VERIFICAR', qrX, qrY - 12, { 
                   width: 100, 
                   align: 'center' 
               });
            
            // Petit texte en dessous
            doc.fontSize(6)
               .fillColor('#999')
               .text('válido por QR', qrX, qrY + 110, { 
                   width: 100, 
                   align: 'center' 
               });
            
            console.log('✅ QR code gerado para:', numero);
            
        } catch (qrError) {
            console.error('❌ Erro ao gerar QR:', qrError);
            
            // Fallback mínimo (apenas uma mensagem discreta)
            doc.fontSize(7)
               .fillColor('#999')
               .text('QR indisponível', 280, y - 10);
        }
        
        // =========================================
        // RODAPÉ
        // =========================================
        doc.fontSize(8)
            .fillColor('#666')
            .text('Documento válido em todo território nacional', 0, 780, { align: 'center' });
        
        doc.end();
        
    } catch (error) {
        console.error('❌ Erreur PDF:', error);
        res.status(500).json({ error: 'Erreur lors de la génération du PDF: ' + error.message });
    }
});
// =============================================
// FORMULÁRIO NOVO
// =============================================
app.get('/novo-certificado', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'novo-certificado.html'));
});

// =============================================
// STATS GLOBAIS (MINISTÉRIO)
// =============================================
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

// =============================================
// =============================================
// GÉNÉRATION PDF POUR LABORATOIRE (OPTIMISÉ)
// =============================================
app.post('/api/labs/pdf', authMiddleware, async (req, res) => {
  try {
    const labData = req.body;

    // Validation minimale
    if (!labData || !labData.nome) {
      return res.status(400).json({ error: 'Données du laboratoire incomplètes' });
    }

    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
      info: {
        Title: `Laboratoire ${labData.nome}`,
        Author: 'SNS Angola',
        Subject: 'Fiche d\'enregistrement de laboratoire'
      }
    });

    // Affichage direct dans le navigateur (inline) – peut être changé en "attachment" si souhaité
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=Laboratorio_${labData.nome.replace(/\s/g, '_')}.pdf`);
    doc.pipe(res);

    // ---------- EN-TÊTE OFFICIEL (identique aux certificats) ----------
    doc.fillColor('#006633');
    doc.fontSize(20).text('REPÚBLICA DE ANGOLA', 0, 50, { align: 'center' });
    doc.fontSize(16).text('MINISTÉRIO DA SAÚDE', 0, 80, { align: 'center' });
    doc.fontSize(24).text('SISTEMA NACIONAL DE SAÚDE', 0, 110, { align: 'center' });

    doc.strokeColor('#006633')
      .lineWidth(2)
      .moveTo(doc.page.width / 2 - 250, 150)
      .lineTo(doc.page.width / 2 + 250, 150)
      .stroke();

    let y = 180;

    // ---------- TITRE DE LA SECTION ----------
    doc.fillColor('#006633')
      .fontSize(16)
      .text('REGISTO DE LABORATÓRIO', 50, y);
    y += 30;

    // ---------- FONCTION D'AJOUT DE LIGNE AVEC GESTION DE PAGE ----------
    const addLine = (label, value, defaultValue = 'Não informado') => {
      const displayValue = (value && value.toString().trim() !== '') ? value : defaultValue;
      if (y > 750) {
        doc.addPage();
        y = 50;
        doc.fillColor('#006633').fontSize(12).text('SNS Angola – Registo de Laboratório (continuação)', 50, y, { align: 'center' });
        y += 30;
      }
      doc.fillColor('#000')
        .fontSize(11)
        .text(`${label}: ${displayValue}`, 70, y);
      y += 20;
    };

    // ---------- INFORMATIONS PRINCIPALES (tous les champs disponibles) ----------
    addLine('ID do Laboratório', labData.labId);               // généré par MongoDB, peut être absent
    addLine('Nome', labData.nome);
    addLine('NIF', labData.nif);
    addLine('Tipo', labData.tipo);
    addLine('Província', labData.provincia);
    addLine('Município', labData.municipio);
    addLine('Endereço', labData.endereco);
    addLine('Telefone', labData.telefone);
    addLine('Email', labData.email);
    addLine('Diretor', labData.diretor);
    addLine('Responsável Técnico', labData.responsavelTecnico);
    addLine('Licença', labData.licenca);                       // non utilisé actuellement
    if (labData.validadeLicenca) {
      const dateVal = new Date(labData.validadeLicenca).toLocaleDateString('pt-PT');
      addLine('Validade da Licença', dateVal);
    }
    addLine('Status', labData.ativo ? 'Ativo' : 'Inativo');
    addLine('Total de Emissões', labData.totalEmissoes ?? 0);  // 0 par défaut
    if (labData.createdAt) {
      const created = new Date(labData.createdAt).toLocaleDateString('pt-PT');
      addLine('Data de Registo', created);
    }

    y += 10;

    // ---------- ZONE CONFIDENTIELLE : API KEY (avec avertissement) ----------
    doc.fillColor('#b33')
      .fontSize(12)
      .text('CHAVE API (confidencial)', 70, y);
    y += 20;

    doc.fillColor('#000')
      .fontSize(10)
      .text(labData.apiKey || 'Não gerada', 70, y, { width: 400, align: 'left' });
    y += 30;

    doc.fillColor('#666')
      .fontSize(9)
      .text('Esta chave é pessoal e intransferível. Não a compartilhe.', 70, y);
    y += 30;

    // ---------- PIED DE PAGE ----------
    doc.fontSize(8)
      .fillColor('#666')
      .text('Documento emitido pelo Sistema Nacional de Saúde de Angola', 0, 780, { align: 'center' });

    doc.end();

  } catch (error) {
    console.error('❌ Erreur PDF laboratoire:', error);
    res.status(500).json({ error: 'Erreur lors de la génération du PDF' });
  }
});
// =============================================
// ROUTE POUR LE FORMULAIRE DE CRÉATION DE LABORATOIRE
// =============================================
app.get('/novo-laboratorio', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'novo-laboratorio.html'));
});

// =============================================
// INICIALIZAÇÃO DO SERVIDOR
// =============================================
app.listen(PORT, () => {
    console.log('✅ SNS Online na porta ' + PORT);
});

