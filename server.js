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
    telephone: String,
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

// SCHÉMA CERTIFICAT AMÉLIORÉ avec calculs automatiques
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
    // Champs calculés automatiquement
    imc: Number,
    idade: Number,
    classificacaoIMC: String,
    hash: { type: String, unique: true },
    emitidoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Lab' },
    emitidoEm: { type: Date, default: Date.now }
});

// MIDDLEWARE DE CALCUL AUTOMATIQUE (s'exécute AVANT sauvegarde)
certificateSchema.pre('save', function(next) {
    // Calculer l'âge à partir de la date de naissance
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
    
    // Calculer IMC si les données sont présentes
    if (this.dados && this.dados.peso && this.dados.altura) {
        const peso = parseFloat(this.dados.peso);
        const altura = parseFloat(this.dados.altura);
        if (peso && altura && altura > 0) {
            this.imc = parseFloat((peso / (altura * altura)).toFixed(2));
            
            // Classifier l'IMC
            if (this.imc < 18.5) this.classificacaoIMC = "Abaixo do peso";
            else if (this.imc < 25) this.classificacaoIMC = "Peso normal";
            else if (this.imc < 30) this.classificacaoIMC = "Sobrepeso";
            else this.classificacaoIMC = "Obesidade";
        }
    }
    
    next();
});

// MÉTHODE D'INSTANCE POUR PRÉPARER LES DONNÉES PDF
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
// DASHBOARD DO MINISTERIO
// ================================================
app.get('/admin-dashboard', (req, res) => {
    res.send('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Admin - SNS</title><style>*{margin:0;padding:0;box-sizing:border-box;font-family:Arial;}body{display:flex;background:#f5f5f5;}.sidebar{width:250px;background:#006633;color:white;height:100vh;padding:20px;position:fixed;}.sidebar a{display:block;color:white;text-decoration:none;padding:10px;margin:5px 0;border-radius:5px;cursor:pointer;}.sidebar a:hover{background:#004d26;}.main{margin-left:270px;padding:30px;width:100%;}.btn{background:#006633;color:white;border:none;padding:10px 20px;cursor:pointer;border-radius:5px;}.modal{display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);align-items:center;justify-content:center;}.modal-content{background:white;padding:20px;border-radius:10px;width:400px;}table{width:100%;background:white;border-collapse:collapse;margin-top:20px;}th,td{padding:10px;border-bottom:1px solid #ddd;}</style></head><body><div class="sidebar"><h2>SNS-Admin</h2><a onclick="mostrar(\'dashboard\')">Dashboard</a><a onclick="mostrar(\'labs\')">Laboratórios</a><button onclick="logout()" class="btn" style="background:red;width:100%;margin-top:20px;">Sair</button></div><div class="main"><div id="dashboard"><h2>Painel de Controle</h2><p id="stats">Carregando estatisticas...</p></div><div id="labs" style="display:none;"><h2>Laboratórios <button class="btn" onclick="document.getElementById(\'modalLab\').style.display=\'flex\'">+ Novo</button></h2><table><thead><tr><th>Nome</th><th>NIF</th><th>Status</th><th>Ações</th></tr></thead><tbody id="labTable"></tbody></table></div></div><div id="modalLab" class="modal"><div class="modal-content"><h3>Novo Laboratório</h3><input id="lNome" style="width:100%;margin:5px 0;padding:8px;" placeholder="Nome"><input id="lNIF" style="width:100%;margin:5px 0;padding:8px;" placeholder="NIF"><input id="lProv" style="width:100%;margin:5px 0;padding:8px;" placeholder="Província"><input id="lEmail" style="width:100%;margin:5px 0;padding:8px;" placeholder="Email"><button class="btn" onclick="criarLab()">Criar</button><button class="btn" style="background:gray;" onclick="document.getElementById(\'modalLab\').style.display=\'none\'">Cancelar</button></div></div><script>const token=localStorage.getItem("token");if(!token)window.location.href="/ministerio";function mostrar(id){document.getElementById("dashboard").style.display=id==="dashboard"?"block":"none";document.getElementById("labs").style.display=id==="labs"?"block":"none";if(id==="labs")carregarLabs();}async function carregarLabs(){const r=await fetch("/api/labs",{headers:{"Authorization":"Bearer "+token}});const labs=await r.json();let html="";labs.forEach(l=>{html+=`<tr><td>${l.nome}</td><td>${l.nif}</td><td>${l.ativo?"Ativo":"Inativo"}</td><td><button onclick="ativar(\'${l._id}\',${l.ativo})">${l.ativo?"Desativar":"Ativar"}</button></td></tr>`;});document.getElementById("labTable").innerHTML=html;}async function criarLab(){const d={nome:document.getElementById("lNome").value,nif:document.getElementById("lNIF").value,provincia:document.getElementById("lProv").value,email:document.getElementById("lEmail").value,tipo:"laboratorio"};const r=await fetch("/api/labs",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},body:JSON.stringify(d)});const res=await r.json();if(res.success){alert("API Key: "+res.apiKey);location.reload();}}function logout(){localStorage.removeItem("token");location.href="/";}</script></body></html>');
});

// ================================================
// DASHBOARD DO LABORATORIO
// ================================================
app.get('/lab-dashboard', (req, res) => {
    res.send(`<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Laboratório - SNS</title>
    <style>
        *{margin:0;padding:0;box-sizing:border-box;font-family:Arial;}
        body{display:flex;background:#f5f5f5;}
        .sidebar{width:250px;background:#006633;color:white;height:100vh;padding:20px;position:fixed;}
        .sidebar h2{margin-bottom:30px;}
        .sidebar a{display:block;color:white;text-decoration:none;padding:12px;margin:5px 0;border-radius:5px;cursor:pointer;}
        .sidebar a:hover{background:#004d26;}
        .main{margin-left:270px;padding:30px;width:100%;}
        .welcome{background:#e8f5e9;padding:20px;border-left:5px solid #006633;margin-bottom:20px;}
        .btn{background:#006633;color:white;border:none;padding:10px 20px;cursor:pointer;border-radius:5px;}
        .btn-danger{background:#dc3545;}
        .secao{display:none;}
        .secao.ativa{display:block;}
        .card-container{display:flex;gap:15px;margin-top:20px;margin-bottom:30px;}
        .card{background:white;padding:20px;border-radius:10px;flex:1;border-top:4px solid #006633;box-shadow:0 2px 5px rgba(0,0,0,0.1);text-align:center;}
        .card h4{color:#666;font-size:14px;text-transform:uppercase;margin-bottom:10px;}
        .card p{font-size:28px;font-weight:bold;color:#006633;}
        table{width:100%;background:white;border-collapse:collapse;margin-top:20px;}
        th{background:#006633;color:white;padding:12px;text-align:left;}
        td{padding:12px;border-bottom:1px solid #ddd;}

        /* SOLUTION POUR SUPPRIMER LE MENU SUR LE PDF/IMPRESSION */
        @media print {
            .sidebar, .btn, .btn-danger, .welcome {
                display: none !important;
            }
            .main {
                margin-left: 0 !important;
                padding: 0 !important;
                width: 100% !important;
            }
            body {
                background: white !important;
            }
            .card {
                border: 1px solid #eee !important;
                box-shadow: none !important;
            }
        }
    </style>
</head>
<body>
    <div class="sidebar">
        <h2>SNS - Lab</h2>
        <a onclick="mostrar('dashboard')">Relatórios</a>
        <a onclick="mostrar('certificados')">Meus Certificados</a>
        <button onclick="logout()" class="btn btn-danger" style="margin-top:20px;width:100%;">Sair</button>
    </div>

    <div class="main">
        <div id="welcome" class="welcome"></div>
        
        <div id="secaoDashboard" class="secao ativa">
            <h2>Relatórios de Emissão</h2>
            <div class="card-container">
                <div class="card">
                    <h4>Hoje</h4>
                    <p id="statDiario">0</p>
                </div>
                <div class="card">
                    <h4>Este Mês</h4>
                    <p id="statMensal">0</p>
                </div>
                <div class="card">
                    <h4>Este Ano</h4>
                    <p id="statAnual">0</p>
                </div>
                <div class="card" style="border-top-color:#ffa500;">
                    <h4>Total Geral</h4>
                    <p id="statTotal" style="color:#ffa500;">0</p>
                </div>
            </div>
        </div>

        <div id="secaoCertificados" class="secao">
            <h2>Certificados 
                <button class="btn" style="float:right;" onclick="window.location.href='/novo-certificado'">+ Novo</button>
            </h2>
            <table>
                <thead>
                    <tr>
                        <th>Número</th>
                        <th>Tipo</th>
                        <th>Paciente</th>
                        <th>Data</th>
                    </tr>
                </thead>
                <tbody id="tabela"></tbody>
            </table>
        </div>
    </div>

    <script>
        const key = localStorage.getItem("labKey");
        if(!key) window.location.href="/lab-login";
        
        const tipos = ["","GENÓTIPO","BOA SAÚDE","INCAPACIDADE","APTIDÃO","SAÚDE MATERNA","PRÉ-NATAL","EPIDEMIOLÓGICO","CSD"];

        async function carregarDados(){
            try {
                const rMe = await fetch("/api/labs/me", {headers:{"x-api-key":key}});
                const dMe = await rMe.json();
                document.getElementById("welcome").innerHTML = "<h2>Bem-vindo, "+dMe.nome+"</h2>";

                const rStats = await fetch("/api/certificados/stats-detalhes", {headers:{"x-api-key":key}});
                const dStats = await rStats.json();
                document.getElementById("statDiario").innerText = dStats.diario;
                document.getElementById("statMensal").innerText = dStats.mensal;
                document.getElementById("statAnual").innerText = dStats.anual;
                document.getElementById("statTotal").innerText = dStats.total;

                const rCert = await fetch("/api/certificados/lab", {headers:{"x-api-key":key}});
                const lista = await rCert.json();
                let html = "";
                lista.forEach(c => {
                    html += "<tr><td>"+c.numero+"</td><td>"+tipos[c.tipo]+"</td><td>"+c.paciente.nomeCompleto+"</td><td>"+new Date(c.emitidoEm).toLocaleDateString()+"</td></tr>";
                });
                document.getElementById("tabela").innerHTML = html || "<tr><td colspan='4'>Nenhum certificado.</td></tr>";
            } catch(e) {
                console.error(e);
            }
        }

        function mostrar(s){
            document.getElementById("secaoDashboard").classList.remove("ativa");
            document.getElementById("secaoCertificados").classList.remove("ativa");
            if(s==="dashboard") document.getElementById("secaoDashboard").classList.add("ativa");
            if(s==="certificados") document.getElementById("secaoCertificados").classList.add("ativa");
        }

        function logout(){
            localStorage.removeItem("labKey");
            window.location.href="/";
        }

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

// Listar todos os laboratórios (apenas admin)
app.get('/api/labs', authMiddleware, async (req, res) => {
    try {
        const labs = await Lab.find({}, { apiKey: 0 });
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
// INICIALIZAÇÃO DO SERVIDOR
// =============================================
app.listen(PORT, () => {
    console.log('✅ SNS Online na porta ' + PORT);
});

