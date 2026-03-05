// =======================
// SNS - SISTEMA NACIONAL DE SAÚDE
// MINISTÉRIO DA SAÚDE - ANGOLA
// VERSÃO FINAL COM RELATÓRIOS DETALHADOS
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
    return /^\d{10}$/.test(nif);
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

// USER (Administrador)
const userSchema = new mongoose.Schema({
    nome: String,
    email: { type: String, unique: true },
    password: String,
    role: { type: String, default: 'admin' }
});

// LABORATÓRIO (COM CAMPOS COMPLETOS)
const labSchema = new mongoose.Schema({
    labId: { type: String, unique: true },
    // Informações Básicas
    nome: { type: String, required: true },
    nif: { type: String, required: true, unique: true },
    tipo: { type: String, enum: ['Público', 'Privado', 'Misto'], required: true },
    // Localização
    provincia: { type: String, required: true },
    municipio: String,
    endereco: { type: String, required: true },
    // Contactos
    telephone: { type: String, required: true },
    telephone2: String,
    email: { type: String, required: true },
    website: String,
    // Responsáveis
    diretor: { type: String, required: true },
    responsavelTecnico: String,
    // Licenciamento
    licença: String,
    validadeLicença: Date,
    // Chave e status
    apiKey: { type: String, unique: true },
    ativo: { type: Boolean, default: true },
    totalEmissoes: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});

// HOSPITAL
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

// EMPRESA
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

// CERTIFICADO (com calculos automáticos)
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
    
    // Campos calculados automaticamente
    imc: Number,
    idade: Number,
    classificacaoIMC: String,
    
    hash: { type: String, unique: true },
    emitidoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Lab' },
    emitidoEm: { type: Date, default: Date.now }
});

// MIDDLEWARE DE CÁLCULO AUTOMÁTICO (executa ANTES de salvar)
certificateSchema.pre('save', function(next) {
    // Calcular idade a partir da data de nascimento
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

    // Calcular IMC se os dados estiverem presentes
    if (this.dados && this.dados.peso && this.dados.altura) {
        const peso = parseFloat(this.dados.peso);
        const altura = parseFloat(this.dados.altura);
        if (peso && altura && altura > 0) {
            this.imc = parseFloat((peso / (altura * altura)).toFixed(2));

            // Classificar IMC
            if (this.imc < 18.5) this.classificacaoIMC = "Abaixo do peso";
            else if (this.imc < 25) this.classificacaoIMC = "Peso normal";
            else if (this.imc < 30) this.classificacaoIMC = "Sobrepeso";
            else this.classificacaoIMC = "Obesidade";
        }
    }
    next();
});

// MÉTODO DE INSTÂNCIA PARA PREPARAR DADOS DO PDF
certificateSchema.methods.prepararParaPDF = function() {
    return {
        numero: this.numero,
        tipo: this.tipo,
        paciente: this.paciente,
        laborantin: this.laborantin,
        dados: this.dados,
        imc: this.imc,
        idade: this.idade,
        classificacaoIMC: this.classificacaoIMC,
        emitidoEm: this.emitidoEm
    };
};

// CRIAÇÃO DOS MODELOS
const User = mongoose.model('User', userSchema);
const Lab = mongoose.model('Lab', labSchema);
const Hospital = mongoose.model('Hospital', hospitalSchema);
const Empresa = mongoose.model('Empresa', empresaSchema);
const Certificate = mongoose.model('Certificate', certificateSchema);

// ===============================================
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

// LOGIN MINISTÉRIO
app.get('/ministerio', (req, res) => {
    res.send('<!DOCTYPE html><html><head><title>Login Ministério</title><style>body{background:#006633;font-family:Arial;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;}.container{background:white;padding:30px;border-radius:10px;width:350px;}h2{color:#006633;text-align:center;}input{width:100%;padding:10px;margin:10px 0;border:1px solid #ddd;border-radius:5px;}button{width:100%;padding:12px;background:#006633;color:white;border:none;border-radius:5px;cursor:pointer;}.error{color:red;display:none;text-align:center;}</style></head><body><div class="container"><h2>Ministério da Saúde</h2><div id="error" class="error"></div><input type="email" id="email" placeholder="Email" value="admin@sns.gov.ao"><input type="password" id="password" placeholder="Senha" value="Admin@2025"><button onclick="login()">Entrar</button></div><script>async function login(){const e=document.getElementById("email").value;const p=document.getElementById("password").value;const r=await fetch("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:e,password:p})});const d=await r.json();if(d.token){localStorage.setItem("token",d.token);window.location.href="/admin-dashboard";}else{document.getElementById("error").style.display="block";document.getElementById("error").innerText="Erro no login";}}</script></body></html>');
});

// LOGIN LABORATÓRIO
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
        .pagination {
            display:flex;
            justify-content:center;
            gap:10px;
            margin-top:20px;
        }
        .pagination button {
            padding:8px 12px;
            border:none;
            background:#006633;
            color:white;
            border-radius:5px;
            cursor:pointer;
        }
        .pagination button:disabled {
            background:#ccc;
            cursor:not-allowed;
        }
        .filtros {
            display:flex;
            gap:10px;
            margin-bottom:20px;
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
                        <option value="Luanda">Luanda</option>
                        <option value="Benguela">Benguela</option>
                        <option value="Huíla">Huíla</option>
                        <option value="Cabinda">Cabinda</option>
                        <option value="Outra">Outra</option>
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
                        <tr><td colspan="7" style="text-align:center;">Aguardando...</td></tr>
                    </tbody>
                </table>
                
                <!-- Paginação -->
                <div class="pagination" id="paginacao">
                    <button id="prevPage" onclick="mudarPagina(-1)" disabled>Anterior</button>
                    <span id="pageInfo">Página 1</span>
                    <button id="nextPage" onclick="mudarPagina(1)" disabled>Próxima</button>
                </div>
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

        // Variáveis de paginação
        var currentPage = 1;
        var totalPages = 1;
        var limit = 10;

        function mostrarSeccao(id) {
            document.getElementById('dashboardSection').className = 'secao';
            document.getElementById('laboratoriosSection').className = 'secao';
            document.getElementById(id).className = 'secao active';
            if (id === 'laboratoriosSection') {
                carregarLaboratorios();
            }
        }

        // Carregar estatísticas (corrigido: espaço após Bearer)
        function carregarStats() {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', '/api/stats', true);
            xhr.setRequestHeader('Authorization', 'Bearer ' + token);
            xhr.onreadystatechange = function() {
                if (xhr.readyState === 4 && xhr.status === 200) {
                    var data = JSON.parse(xhr.responseText);
                    document.getElementById('statsLabs').innerHTML = data.labs || 0;
                    document.getElementById('statsHospitais').innerHTML = data.hospitais || 0;
                    document.getElementById('statsEmpresas').innerHTML = data.empresas || 0;
                    var total = (data.labs||0) + (data.hospitais||0) + (data.empresas||0);
                    document.getElementById('statsTotal').innerHTML = total;
                }
            };
            xhr.send();
        }

        // Carregar laboratórios com paginação e filtros (corrigido)
        function carregarLaboratorios(pagina = 1) {
            console.log("Carregando laboratórios, página", pagina);
            currentPage = pagina;
            var tbody = document.getElementById('tabelaLabs');
            var spinner = document.getElementById('spinnerLabs');
            tbody.innerHTML = ''; // Limpa a tabela
            spinner.style.display = 'block'; // Mostra spinner

            var provincia = document.getElementById('filtroProvincia').value;
            var status = document.getElementById('filtroStatus').value;

            var url = '/api/labs?page=' + currentPage + '&limit=' + limit;
            if (provincia) url += '&provincia=' + encodeURIComponent(provincia);
            if (status !== '') url += '&ativo=' + status;

            var xhr = new XMLHttpRequest();
            xhr.open('GET', url, true);
            xhr.setRequestHeader('Authorization', 'Bearer ' + token);
            xhr.onreadystatechange = function() {
                if (xhr.readyState === 4) {
                    spinner.style.display = 'none';
                    console.log("Resposta recebida, status:", xhr.status);
                    if (xhr.status === 200) {
                        try {
                            var resposta = JSON.parse(xhr.responseText);
                            var lista = resposta.labs;
                            totalPages = resposta.pages;
                            console.log("Laboratórios recebidos:", lista);

                            if (!lista || lista.length === 0) {
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
                                    html += '<td>' + (l.telefone || '') + '</td>';
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
                            atualizarPaginacao();
                        } catch (e) {
                            console.error("Erro ao parsear JSON:", e);
                            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:red;">Erro nos dados recebidos</td></tr>';
                        }
                    } else {
                        console.error("Erro HTTP:", xhr.status);
                        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:red;">Erro ao carregar: ' + xhr.status + '</td></tr>';
                    }
                }
            };
            xhr.send();
        }

        function atualizarPaginacao() {
            document.getElementById('pageInfo').innerText = 'Página ' + currentPage + ' de ' + totalPages;
            document.getElementById('prevPage').disabled = currentPage <= 1;
            document.getElementById('nextPage').disabled = currentPage >= totalPages;
        }

        function mudarPagina(direcao) {
            var novaPagina = currentPage + direcao;
            if (novaPagina >= 1 && novaPagina <= totalPages) {
                carregarLaboratorios(novaPagina);
            }
        }

        function verDetalhes(id) {
            // Redirecionar para uma página de detalhes ou abrir modal
            alert('Detalhes do laboratório em breve...');
        }

        function toggleStatus(id, ativoAtual) {
            var acao = ativoAtual ? 'desativar' : 'ativar';
            if (confirm('Tem certeza que deseja ' + acao + ' este laboratório?')) {
                alert('Função em desenvolvimento: ' + acao);
                carregarLaboratorios(currentPage);
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
// ================================================
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
// ROTAS DA API
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

// Listar todos os laboratórios (apenas admin) com paginação
app.get('/api/labs', authMiddleware, async (req, res) => {
    try {
        const { page = 1, limit = 10, provincia, ativo } = req.query;
        const filter = {};
        if (provincia) filter.provincia = provincia;
        if (ativo !== undefined) filter.ativo = ativo === 'true';

        const labs = await Lab.find(filter, { apiKey: 0 })
            .skip((parseInt(page) - 1) * parseInt(limit))
            .limit(parseInt(limit))
            .sort({ createdAt: -1 });

        const total = await Lab.countDocuments(filter);

        res.json({
            labs,
            total,
            page: parseInt(page),
            pages: Math.ceil(total / parseInt(limit))
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao listar laboratórios' });
    }
});
// =============================================
// ROUTE POUR OBTENIR LE PDF D'UN LABORATOIRE (PAR ID)
// =============================================
app.get('/api/labs/:id/pdf', authMiddleware, async (req, res) => {
    try {
        const lab = await Lab.findById(req.params.id);
        if (!lab) {
            return res.status(404).json({ error: 'Laboratório não encontrado' });
        }

        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=lab-${lab.labId || lab._id}.pdf`);
        doc.pipe(res);

        // --- Construction du PDF (identique à la route /api/labs/pdf) ---
        doc.fillColor('#006633');
        doc.fontSize(20).text('REPÚBLICA DE ANGOLA', 0, 50, { align: 'center' });
        doc.fontSize(16).text('MINISTÉRIO DA SAÚDE', 0, 80, { align: 'center' });
        doc.fontSize(24).text('SISTEMA NACIONAL DE SAÚDE', 0, 110, { align: 'center' });
        doc.strokeColor('#006633').lineWidth(2).moveTo(50, 150).lineTo(550, 150).stroke();

        let y = 180;
        doc.fillColor('#006633').fontSize(18).text('CREDENCIAÇÃO DE LABORATÓRIO', 0, y, { align: 'center' });
        y += 30;

        doc.fillColor('#006633').fontSize(14).text('Laboratório:', 50, y);
        y += 20;
        doc.fillColor('#000').fontSize(12).text(lab.nome, 70, y);
        y += 20;
        doc.text('NIF: ' + (lab.nif || 'N/I'), 70, y);
        y += 20;
        doc.text('Província: ' + (lab.provincia || 'N/I') + (lab.municipio ? ' - ' + lab.municipio : ''), 70, y);
        y += 20;
        doc.text('Endereço: ' + (lab.endereco || 'N/I'), 70, y);
        y += 20;
        doc.text('Telefone: ' + (lab.telefone || 'N/I') + (lab.telefone2 ? ' / ' + lab.telefone2 : ''), 70, y);
        y += 20;
        doc.text('Email: ' + (lab.email || 'N/I'), 70, y);
        if (lab.website) {
            y += 20;
            doc.text('Website: ' + lab.website, 70, y);
        }
        y += 20;
        doc.text('Diretor: ' + (lab.diretor || 'N/I'), 70, y);
        if (lab.responsavelTecnico) {
            y += 20;
            doc.text('Responsável Técnico: ' + lab.responsavelTecnico, 70, y);
        }
        if (lab.licenca) {
            y += 20;
            doc.text('Licença: ' + lab.licenca + (lab.validadeLicenca ? ' (válida até ' + new Date(lab.validadeLicenca).toLocaleDateString('pt-PT') + ')' : ''), 70, y);
        }

        y += 40;
        doc.fillColor('#006633').fontSize(16).text('CHAVE DE ACESSO API', 0, y, { align: 'center' });
        y += 30;

        doc.roundedRect(100, y, 400, 50, 10).fillAndStroke('#e8f5e9', '#006633');
        doc.fillColor('#006633').fontSize(14).text('API Key:', 120, y + 10);
        doc.fillColor('#000').fontSize(18).font('Courier').text(lab.apiKey, 120, y + 25);

        y += 70;
        doc.fillColor('#dc3545').fontSize(12).text('⚠️ ATENÇÃO - CONFIDENCIAL ⚠️', 0, y, { align: 'center' });
        y += 20;
        doc.fillColor('#666').fontSize(10)
            .text('Esta chave de acesso é pessoal e intransferível.', 0, y, { align: 'center' });
        y += 15;
        doc.text('Não compartilhe esta chave com terceiros.', 0, y, { align: 'center' });
        y += 15;
        doc.text('O titular é responsável por todas as operações realizadas com esta chave.', 0, y, { align: 'center' });
        y += 15;
        doc.text('Em caso de perda ou suspeita de uso indevido, contacte imediatamente o Ministério da Saúde.', 0, y, { align: 'center' });

        y += 30;
        doc.fillColor('#666').fontSize(10).text('Documento emitido em: ' + new Date().toLocaleDateString('pt-PT'), 50, y);

        doc.fontSize(8).fillColor('#999')
            .text('Documento oficial do Ministério da Saúde - República de Angola', 0, 780, { align: 'center' });

        doc.end();
    } catch (error) {
        console.error('Erreur PDF Lab:', error);
        res.status(500).json({ error: 'Erro ao gerar PDF' });
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
        
        // Os middlewares pre-save calcularão IMC e idade automaticamente
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
// =============================================
// FORMULÁRIO NOVO LABORATÓRIO
// =============================================
app.get('/novo-laboratorio', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'novo-laboratorio.html'));
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
// INICIALIZAÇÃO DO SERVIDOR
// =============================================
app.listen(PORT, () => {
    console.log('✅ SNS Online na porta ' + PORT);
});


