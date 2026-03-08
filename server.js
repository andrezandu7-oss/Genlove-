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
const QRCode = require('qrcode'); // Assurez-vous d'avoir installé qrcode
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ========================
// CONFIGURAÇÕES
// ========================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
  tipo: { type: String, enum: ['laboratorio', 'hospital', 'clinica'] }, // valores normalizados
  provincia: String,
  endereco: String,
  email: String,
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
  laborantin: {
    nome: String,
    registro: String
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
    // Outros campos podem ser adicionados conforme necessário
  },
  hash: { type: String, unique: true },
  emitidoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Lab' },
  emitidoEm: { type: Date, default: Date.now }
});

// Método de instância para preparar dados para PDF (opcional)
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
// ROTAS PÚBLICAS (PÁGINAS HTML)
// ============================================
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
  <title>SNS - Angola</title>
  <style>
    body { background:#006633; font-family:Arial; display:flex; justify-content:center; align-items:center; height:100vh; margin:0; }
    .box { background:white; padding:30px; border-radius:10px; width:300px; text-align:center; }
    a { display:block; margin:10px; padding:10px; background:#006633; color:white; text-decoration:none; border-radius:5px; }
  </style>
</head>
<body>
  <div class="box">
    <h1>SNS - Angola</h1>
    <a href="/ministerio">Ministério da Saúde</a>
    <a href="/lab-login">Laboratório</a>
  </div>
</body>
</html>`);
});

app.get('/ministerio', (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
  <title>Login Ministério</title>
  <style>
    body { background:#006633; font-family:Arial; display:flex; justify-content:center; align-items:center; height:100vh; margin:0; }
    .box { background:white; padding:30px; border-radius:10px; width:300px; }
    input { width:100%; padding:10px; margin:10px 0; border:1px solid #ddd; border-radius:5px; }
    button { width:100%; padding:10px; background:#006633; color:white; border:none; border-radius:5px; cursor:pointer; }
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
      const r = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: document.getElementById("email").value, password: document.getElementById("password").value })
      });
      const d = await r.json();
      if (d.token) {
        localStorage.setItem("token", d.token);
        window.location.href = "/admin-dashboard";
      } else alert("Erro: " + (d.erro || "Credenciais inválidas"));
    }
  </script>
</body>
</html>`);
});

app.get('/lab-login', (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
  <title>Login Laboratório</title>
  <style>
    body { background:#006633; font-family:Arial; display:flex; justify-content:center; align-items:center; height:100vh; margin:0; }
    .box { background:white; padding:30px; border-radius:10px; width:300px; }
    input { width:100%; padding:10px; margin:10px 0; border:1px solid #ddd; border-radius:5px; }
    button { width:100%; padding:10px; background:#006633; color:white; border:none; border-radius:5px; cursor:pointer; }
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
      const key = document.getElementById("apiKey").value;
      if (key) {
        localStorage.setItem("labKey", key);
        window.location.href = "/lab-dashboard";
      } else alert("Digite a API Key");
    }
  </script>
</body>
</html>`);
});

// ============================================
// DASHBOARD DO MINISTÉRIO (versão completa)
// ============================================
app.get('/admin-dashboard', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SNS - Ministério da Saúde</title>
  <style>
    :root {--primary: #006633; --bg: #f4f7f6; --text: #333; }
    * { margin:0; padding:0; box-sizing:border-box; font-family: 'Segoe UI', sans-serif; }
    body { display: flex; background: var(--bg); min-height: 100vh; color: var(--text); }
    .sidebar { width: 260px; background: var(--primary); color: white; position: fixed; height: 100vh; padding: 20px; display: flex; flex-direction: column; z-index: 100; }
    .sidebar h2 { font-size: 18px; text-align: center; margin-bottom: 20px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 10px; }
    .sidebar button { background: none; border: none; color: white; padding: 15px; text-align: left; width: 100%; cursor: pointer; border-radius: 8px; margin-bottom: 5px; }
    .sidebar button.active { background: rgba(255,255,255,0.2); font-weight: bold; }
    .main { margin-left: 260px; padding: 40px 20px; width: calc(100% - 260px); display: flex; flex-direction: column; align-items: center; }
    .section { width: 100%; max-width: 1100px; display: none; }
    .active-section { display: flex !important; flex-direction: column; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; width: 100%; }
    .stat-card { background: white; padding: 25px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); text-align: center; border-top: 5px solid var(--primary); }
    .stat-card p { font-size: 35px; font-weight: bold; color: var(--primary); }
    .card-table { background: white; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); padding: 20px; width: 100%; overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; min-width: 700px; }
    th, td { text-align: left; padding: 12px; border-bottom: 1px solid #eee; font-size: 14px; }
    .btn-acao { background: #f0f0f0; border: none; padding: 8px; border-radius: 5px; cursor: pointer; margin-right: 5px; font-size: 16px; }
    .btn-add { background: var(--primary); color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-weight: bold; }
    .modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); align-items: center; justify-content: center; z-index: 2000; padding: 20px; }
    .modal-content { background: white; padding: 30px; border-radius: 15px; width: 100%; max-width: 800px; max-height: 90vh; overflow-y: auto; }
    .grid-form { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
    .campo { display: flex; flex-direction: column; }
    .campo label { font-weight: bold; font-size: 11px; margin-bottom: 4px; color: #666; }
    .campo input, .campo select { padding: 10px; border: 1px solid #ddd; border-radius: 6px; }
    @media (max-width: 768px) {
      .sidebar { width: 70px; }
      .sidebar h2, .sidebar button span { display: none; }
      .main { margin-left: 70px; width: calc(100% - 70px); }
    }
  </style>
</head>
<body>
  <div class="sidebar">
    <h2>SNS</h2>
    <button onclick="showTab('dash')" id="btn-dash" class="active"><span>Dashboard</span></button>
    <button onclick="showTab('labs')" id="btn-labs"><span>Laboratórios</span></button>
    <button onclick="logout()" style="margin-top:auto; background:#c0392b; color:white; border-radius:8px; padding:10px; text-align:center;">Sair</button>
  </div>
  <div class="main">
    <div id="sec-dash" class="section active-section">
      <h1 style="margin-bottom:20px; width:100%">Painel Geral</h1>
      <div class="stats-grid">
        <div class="stat-card"><h3>Laboratórios</h3><p id="countLabs">0</p></div>
        <div class="stat-card"><h3>Hospitais</h3><p id="countHosp">0</p></div>
        <div class="stat-card"><h3>Empresas</h3><p id="countEmp">0</p></div>
      </div>
    </div>
    <div id="sec-labs" class="section">
      <div style="display:flex; justify-content:space-between; width:100%; margin-bottom:20px;">
        <h2>Unidades Registadas</h2>
        <button class="btn-add" onclick="openModal()">➕ Novo Registo</button>
      </div>
      <div class="card-table">
        <table>
          <thead>
            <tr><th>Nome</th><th>NIF</th><th>Província</th><th style="text-align:center">Ações</th></tr>
          </thead>
          <tbody id="tableLabs"></tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- Modal de registo -->
  <div id="modalLab" class="modal">
    <div class="modal-content">
      <div id="formCorpo">
        <h2 style="color:var(--primary); margin-bottom:20px;">Ficha de Registo</h2>
        <div class="grid-form">
          <div class="campo" style="grid-column: span 2;"><label>Nome Instituição *</label><input type="text" id="labNome"></div>
          <div class="campo"><label>NIF *</label><input type="text" id="labNIF"></div>
          <div class="campo">
            <label>Tipo *</label>
            <select id="labTipo">
              <option value="Laboratório">Laboratório</option>
              <option value="Hospital">Hospital</option>
              <option value="Clínica">Clínica</option>
              <option value="Centro de Saúde">Centro de Saúde</option>
            </select>
          </div>
          <div class="campo">
            <label>Província *</label>
            <select id="labProvincia">
              <option value="Bengo">Bengo</option><option value="Benguela">Benguela</option><option value="Bié">Bié</option>
              <option value="Cabinda">Cabinda</option><option value="Cuando Cubango">Cuando Cubango</option>
              <option value="Cuanza Norte">Cuanza Norte</option><option value="Cuanza Sul">Cuanza Sul</option>
              <option value="Cunene">Cunene</option><option value="Huambo">Huambo</option><option value="Huíla">Huíla</option>
              <option value="Luanda" selected>Luanda</option><option value="Lunda Norte">Lunda Norte</option>
              <option value="Lunda Sul">Lunda Sul</option><option value="Malanje">Malanje</option>
              <option value="Moxico">Moxico</option><option value="Namibe">Namibe</option>
              <option value="Uíge">Uíge</option><option value="Zaire">Zaire</option>
            </select>
          </div>
          <div class="campo"><label>Município</label><input type="text" id="labMunicipio"></div>
          <div class="campo" style="grid-column: span 2;"><label>Endereço</label><input type="text" id="labEndereco"></div>
          <div class="campo"><label>Telefone</label><input type="text" id="labTelefone"></div>
          <div class="campo"><label>Email *</label><input type="email" id="labEmail"></div>
          <div class="campo"><label>Diretor *</label><input type="text" id="labDiretor"></div>
          <div class="campo"><label>Licença Nº</label><input type="text" id="labLicenca"></div>
          <div class="campo"><label>Data Expiração</label><input type="date" id="labExpira"></div>
        </div>
        <div style="margin-top:20px; display:flex; gap:10px;">
          <button class="btn-add" style="flex:2" onclick="preVisualizar()">Revisar Todos os Dados</button>
          <button onclick="closeModal()" style="flex:1; background:#eee; border:none; border-radius:8px; cursor:pointer;">Cancelar</button>
        </div>
      </div>
      <div id="revisaoCorpo" style="display:none;">
        <h2 style="color:orange; margin-bottom:20px;">Confirmar Todos os Detalhes</h2>
        <div id="dadosResumo" style="background:#f9f9f9; padding:20px; border-radius:10px; line-height:1.6; font-size:14px;"></div>
        <div style="margin-top:20px; display:flex; gap:10px;">
          <button class="btn-add" style="flex:2" onclick="confirmarOficialmente()">Salvar Oficialmente</button>
          <button onclick="voltarEdicao()" style="flex:1; background:#ccc; border:none; border-radius:8px; cursor:pointer;">Corrigir Dados</button>
        </div>
      </div>
    </div>
  </div>

  <script>
    const token = localStorage.getItem("token");
    if (!token) window.location.href = "/ministerio";
    let dadosTemp = null;

    function showTab(t) {
      document.querySelectorAll(".section").forEach(s => s.classList.remove("active-section"));
      document.querySelectorAll(".sidebar button").forEach(b => b.classList.remove("active"));
      document.getElementById("sec-"+t).classList.add("active-section");
      document.getElementById("btn-"+t).classList.add("active");
      if (t==='labs') loadLabs(); else loadStats();
    }

    async function loadLabs() {
      try {
        const r = await fetch("/api/labs", { headers: { "Authorization": "Bearer "+token } });
        if (!r.ok) throw new Error("Erro ao carregar laboratórios");
        const labs = await r.json();
        let html = "";
        labs.forEach(l => {
          html += "<tr><td>" + l.nome + "</td><td>" + l.nif + "</td><td>" + l.provincia + "</td>";
          html += "<td style='text-align:center'>";
          html += "<button class='btn-acao' onclick='acaoPDF(\\"" + l._id + "\\", \"view\")'>👁️</button>";
          html += "<button class='btn-acao' onclick='acaoPDF(\\"" + l._id + "\\", \"print\")'>🖨️</button>";
          html += "<button class='btn-acao' onclick='acaoPDF(\\"" + l._id + "\\", \"download\")'>📥</button>";
          html += "</td></tr>";
        });
        document.getElementById("tableLabs").innerHTML = html;
      } catch(e) { console.error(e); alert("Erro ao carregar laboratórios"); }
    }

    async function loadStats() {
      try {
        const r = await fetch("/api/stats", { headers: { "Authorization": "Bearer "+token } });
        if (!r.ok) throw new Error("Erro ao carregar estatísticas");
        const stats = await r.json();
        document.getElementById("countLabs").innerText = stats.labs || 0;
        document.getElementById("countHosp").innerText = stats.hospitais || 0;
        document.getElementById("countEmp").innerText = stats.empresas || 0;
      } catch(e) { console.error(e); }
    }

    function preVisualizar() {
      dadosTemp = {
        nome: document.getElementById("labNome").value.trim(),
        nif: document.getElementById("labNIF").value.trim(),
        tipo: document.getElementById("labTipo").value,
        provincia: document.getElementById("labProvincia").value,
        municipio: document.getElementById("labMunicipio").value.trim() || "Não informado",
        endereco: document.getElementById("labEndereco").value.trim() || "Não informado",
        telefone: document.getElementById("labTelefone").value.trim() || "Não informado",
        email: document.getElementById("labEmail").value.trim(),
        diretor: document.getElementById("labDiretor").value.trim(),
        licenca: document.getElementById("labLicenca").value.trim() || "Não informado",
        expiracao: document.getElementById("labExpira").value || "Não informado",
        ativo: true
      };
      if (!dadosTemp.nome || !dadosTemp.nif || !dadosTemp.email || !dadosTemp.diretor) {
        return alert("Nome, NIF, Email e Diretor são obrigatórios");
      }
      document.getElementById("formCorpo").style.display = "none";
      document.getElementById("revisaoCorpo").style.display = "block";
      document.getElementById("dadosResumo").innerHTML = \`
        <p><b>Instituição:</b> \${dadosTemp.nome}</p>
        <p><b>NIF:</b> \${dadosTemp.nif}</p>
        <p><b>Tipo:</b> \${dadosTemp.tipo}</p>
        <hr style="margin:10px 0; border:0; border-top:1px solid #ddd;">
        <p><b>Localização:</b> \${dadosTemp.municipio}, \${dadosTemp.provincia}</p>
        <p><b>Endereço:</b> \${dadosTemp.endereco}</p>
        <p><b>Contacto:</b> \${dadosTemp.telefone} | \${dadosTemp.email}</p>
        <p><b>Diretor:</b> \${dadosTemp.diretor}</p>
        <p><b>Licença SNS:</b> \${dadosTemp.licenca} (Expira: \${dadosTemp.expiracao})</p>
      \`;
    }

    async function confirmarOficialmente() {
      if (!dadosTemp) return;
      try {
        const r = await fetch("/api/labs", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer "+token },
          body: JSON.stringify(dadosTemp)
        });
        const resposta = await r.json();
        if (r.ok) {
          alert("Unidade registada com sucesso! API Key: " + resposta.apiKey);
          closeModal();
          loadLabs();
          loadStats();
        } else {
          alert("Erro: " + (resposta.error || resposta.detalhes || JSON.stringify(resposta)));
        }
      } catch(e) {
        alert("Erro de ligação ao servidor.");
      }
    }

    async function acaoPDF(id, acao) {
      try {
        const r = await fetch("/api/labs", { headers: { "Authorization": "Bearer "+token } });
        const labs = await r.json();
        const lab = labs.find(x => x._id === id);
        if (!lab) return alert("Laboratório não encontrado");
        const res = await fetch("/api/labs/pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer "+token },
          body: JSON.stringify(lab)
        });
        if (!res.ok) throw new Error("Erro ao gerar PDF");
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        if (acao === "view") window.open(url);
        else if (acao === "print") { const w = window.open(url); w.onload = () => w.print(); }
        else { const a = document.createElement("a"); a.href = url; a.download = "Registo.pdf"; a.click(); }
      } catch(e) { alert("Erro ao processar PDF: " + e.message); }
    }

    function openModal() {
      document.getElementById("modalLab").style.display = "flex";
      voltarEdicao();
    }
    function closeModal() {
      document.getElementById("modalLab").style.display = "none";
    }
    function voltarEdicao() {
      document.getElementById("revisaoCorpo").style.display = "none";
      document.getElementById("formCorpo").style.display = "block";
    }
    function logout() {
      localStorage.clear();
      window.location.href = "/";
    }
    window.onload = () => { showTab('dash'); };
  </script>
</body>
</html>`);
});

// ============================================
// DASHBOARD DO LABORATÓRIO (versão completa)
// ============================================
app.get('/lab-dashboard', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SNS - Laboratório</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; font-family: 'Segoe UI', Arial, sans-serif; }
    body { display:flex; background:#f5f5f5; min-height: 100vh; }
    .sidebar { width:260px; background:#006633; color:white; height:100vh; padding:20px; position:fixed; display:flex; flex-direction:column; box-shadow: 2px 0 10px rgba(0,0,0,0.1); }
    .sidebar h2 { margin-bottom:30px; text-align:center; padding-bottom:15px; border-bottom:1px solid rgba(255,255,255,0.2); font-size: 22px; }
    .sidebar button { display:block; width:100%; color:rgba(255,255,255,0.9); padding:14px; margin:5px 0; border-radius:8px; cursor:pointer; text-align:left; font-size:15px; border:none; background:none; transition:0.3s; }
    .sidebar button:hover { background:rgba(255,255,255,0.1); color:white; }
    .sidebar .novo-btn { background:#ffa500; color:#00331a; font-weight:bold; margin:20px 0; text-align:center; }
    .sidebar .novo-btn:hover { background:#ffb833; transform:translateY(-2px); }
    .sidebar .sair-btn { background:#cc3300; margin-top:auto; text-align:center; color:white; }
    .sidebar .sair-btn:hover { background:#e63900; }
    .main { margin-left:260px; padding:40px; width:100%; }
    .welcome { background:white; padding:25px; border-left:6px solid #006633; margin-bottom:30px; border-radius:8px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); }
    .secao { display:none; animation: fadeIn 0.3s ease; }
    .secao.active { display:block; }
    @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
    .card { background:white; padding:30px; border-radius:12px; box-shadow:0 4px 15px rgba(0,0,0,0.05); }
    table { width:100%; border-collapse:collapse; margin-top:10px; }
    th { background:#f8f9fa; color:#333; padding:15px; text-align:left; border-bottom:2px solid #eee; }
    td { padding:15px; border-bottom:1px solid #eee; font-size:14px; }
    tr:hover { background:#fafafa; }
    .btn-acao { background:#f0f0f0; border:none; padding:8px; border-radius:5px; cursor:pointer; transition:0.2s; margin-right:5px; }
    .btn-acao:hover { background:#e0e0e0; transform:scale(1.1); }
    .status-badge { background:#e8f5e9; color:#2e7d32; padding:4px 8px; border-radius:4px; font-weight:bold; font-size:11px; }
  </style>
</head>
<body>
  <div class="sidebar">
    <h2>SNS - LABORATÓRIO</h2>
    <button onclick="mostrarSeccao('dashboardSection')">📊 Dashboard</button>
    <button onclick="mostrarSeccao('certificadosSection')">📜 Certificados</button>
    <button class="novo-btn" onclick="location.href='/novo-certificado'">➕ Novo Certificado</button>
    <button class="sair-btn" onclick="logout()">🚪 Sair</button>
  </div>
  <div class="main">
    <div id="welcome" class="welcome"><h2>Carregando...</h2></div>
    <div id="dashboardSection" class="secao active">
      <div class="card">
        <h3>Bem-vindo ao painel do laboratório</h3>
        <p style="margin-top:15px; color:#666;">Selecione uma opção no menu lateral para gerir os certificados.</p>
      </div>
    </div>
    <div id="certificadosSection" class="secao">
      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
          <h2>Certificados Emitidos</h2>
          <button class="btn-acao" onclick="carregarCertificados()">🔄 Atualizar</button>
        </div>
        <table>
          <thead>
            <tr><th>Nº Certificado</th><th>Tipo</th><th>Paciente</th><th>Data</th><th>Ações</th></tr>
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

    const tipos = ["", "GENÓTIPO", "BOA SAÚDE", "INCAPACIDADE", "APTIDÃO", "SAÚDE MATERNA", "PRÉ-NATAL", "EPIDEMIOLÓGICO", "CSD"];

    function mostrarSeccao(id) {
      document.querySelectorAll('.secao').forEach(s => s.classList.remove('active'));
      document.getElementById(id).classList.add('active');
      if (id === 'certificadosSection') carregarCertificados();
    }

    async function carregarDados() {
      try {
        const r = await fetch("/api/labs/me", { headers: { "x-api-key": key } });
        if (!r.ok) throw new Error("Erro ao carregar dados do laboratório");
        const data = await r.json();
        document.getElementById("welcome").innerHTML = \`<h2>Olá, \${data.nome}</h2><p>Laboratório Autorizado pelo Ministério da Saúde</p>\`;
      } catch (e) { console.error(e); }
    }

    async function carregarCertificados() {
      const tbody = document.getElementById("tabela");
      try {
        const r = await fetch("/api/certificados/lab", { headers: { "x-api-key": key } });
        if (!r.ok) throw new Error("Erro ao carregar certificados");
        const lista = await r.json();
        if (!lista || lista.length === 0) {
          tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:40px;">Nenhum certificado emitido ainda.</td></tr>';
          return;
        }
        tbody.innerHTML = lista.map(c => \`
          <tr>
            <td><strong>\${c.numero}</strong></td>
            <td><span class="status-badge">\${tipos[c.tipo] || c.tipo}</span></td>
            <td>\${c.paciente?.nomeCompleto || 'N/I'}</td>
            <td>\${new Date(c.emitidoEm).toLocaleDateString('pt-PT')}</td>
            <td>
              <button class="btn-acao" onclick="gerarPDF('\${c.numero}', 'view')" title="Visualizar">👁️</button>
              <button class="btn-acao" onclick="gerarPDF('\${c.numero}', 'print')" title="Imprimir">🖨️</button>
              <button class="btn-acao" onclick="gerarPDF('\${c.numero}', 'download')" title="Baixar">📥</button>
            </td>
          </tr>\`).join('');
      } catch (e) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:red;">Erro ao carregar dados.</td></tr>';
      }
    }

    async function gerarPDF(numero, acao) {
      try {
        const res = await fetch("/api/certificados/pdf", {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': key },
          body: JSON.stringify({ numero })
        });
        if (!res.ok) throw new Error("Erro ao gerar PDF");
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
      } catch (e) { alert("Erro ao processar PDF: " + e.message); }
    }

    function logout() {
      localStorage.removeItem("labKey");
      window.location.href = "/";
    }

    carregarDados();
  </script>
</body>
</html>`);
});

// ============================================
// ROTAS DA API
// ============================================

// Autenticação
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
    res.status(401).json({ erro: 'Email ou senha incorretos' });
  }
});

// Rota para obter dados do laboratório atual (via API Key)
app.get('/api/labs/me', labMiddleware, async (req, res) => {
  res.json(req.lab);
});

// Criar novo laboratório (apenas admin) - VERSÃO CORRIGIDA COM GESTÃO DE ERROS
app.post('/api/labs', authMiddleware, async (req, res) => {
  try {
    const dados = req.body;

    // Validação dos campos obrigatórios
    const camposObrigatorios = ['nome', 'nif', 'tipo', 'provincia', 'diretor', 'email'];
    for (let campo of camposObrigatorios) {
      if (!dados[campo] || dados[campo].trim() === '') {
        return res.status(400).json({ error: `Campo obrigatório ausente: ${campo}` });
      }
    }

    // Mapeamento do campo tipo para os valores do enum do schema
    const tipoMap = {
      'Laboratório': 'laboratorio',
      'Hospital': 'hospital',
      'Clínica': 'clinica',
      'Centro de Saúde': 'clinica' // ou outro valor, mas deve estar no enum
    };
    const tipoNormalizado = tipoMap[dados.tipo] || dados.tipo;

    // Mapeamento de telefone (o formulário envia "telefone", o schema espera "telephone")
    const telephone = dados.telefone || '';

    const labId = 'LAB' + Date.now();
    const apiKey = gerarApiKey();

    // Construir objeto com os campos permitidos pelo schema
    const labData = {
      labId,
      nome: dados.nome,
      nif: dados.nif,
      tipo: tipoNormalizado,
      provincia: dados.provincia,
      endereco: dados.endereco || '',
      email: dados.email,
      telephone: telephone,
      diretor: dados.diretor,
      apiKey,
      ativo: true
    };

    const lab = new Lab(labData);
    await lab.save();

    res.json({ success: true, labId, apiKey, message: 'Laboratório registado com sucesso' });

  } catch (error) {
    console.error('❌ Erro ao criar laboratório:', error);

    // Erro de validação do Mongoose
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({ error: 'Erro de validação dos dados', detalhes: messages });
    }

    // Erro de chave duplicada (NIF ou API Key)
    if (error.code === 11000) {
      const campo = Object.keys(error.keyPattern)[0];
      return res.status(400).json({ error: `Valor duplicado para o campo: ${campo}`, campo });
    }

    // Outro erro interno
    res.status(500).json({ error: 'Erro interno ao criar laboratório. Tente novamente mais tarde.' });
  }
});

// Listar todos os laboratórios (apenas admin)
app.get('/api/labs', authMiddleware, async (req, res) => {
  try {
    const labs = await Lab.find().sort({ createdAt: -1 });
    res.json(labs);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao listar laboratórios' });
  }
});

// Estatísticas globais (ministério)
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

// Estatísticas detalhadas para laboratório
app.get('/api/certificados/stats-detalhes', labMiddleware, async (req, res) => {
  try {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const inicioAno = new Date(hoje.getFullYear(), 0, 1);

    const stats = await Certificate.aggregate([
      { $match: { emitidoPor: req.lab._id } },
      { $facet: {
          diario: [ { $match: { emitidoEm: { $gte: hoje } } }, { $count: "count" } ],
          mensal: [ { $match: { emitidoEm: { $gte: inicioMes } } }, { $count: "count" } ],
          anual: [ { $match: { emitidoEm: { $gte: inicioAno } } }, { $count: "count" } ],
          porTipo: [ { $group: { _id: "$tipo", count: { $sum: 1 } } } ]
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

// Geração de PDF para certificado
app.post('/api/certificados/pdf', labMiddleware, async (req, res) => {
  try {
    const { numero } = req.body;
    if (!numero) {
      return res.status(400).json({ error: 'Número do certificado não fornecido' });
    }

    const certificado = await Certificate.findOne({ numero, emitidoPor: req.lab._id });
    if (!certificado) {
      return res.status(404).json({ error: 'Certificado não encontrado' });
    }

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
    const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `Certificado ${numero}`, Author: lab.nome, Subject: 'Certificado Médico SNS Angola' } });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=certificado-${numero}.pdf`);
    doc.pipe(res);

    // Cabeçalho
    doc.fillColor('#006633');
    doc.fontSize(20).text('REPUBLICA DE ANGOLA', 0, 50, { align: 'center' });
    doc.fontSize(16).text('MINISTÉRIO DA SAÚDE', 0, 80, { align: 'center' });
    doc.fontSize(24).text('SISTEMA NACIONAL DE SAÚDE', 0, 110, { align: 'center' });
    doc.strokeColor('#006633').lineWidth(2).moveTo(doc.page.width / 2 - 250, 150).lineTo(doc.page.width / 2 + 250, 150).stroke();

    let y = 180;
    doc.fillColor('#006633').fontSize(14).text(lab.nome, 50, y);
    doc.fontSize(10).fillColor('#666').text(`NIF: ${lab.nif} | ${lab.provincia}`, 50, y + 20)
      .text(`Endereço: ${lab.endereco || 'Não informado'} | Tel: ${lab.telephone || 'Não informado'}`, 50, y + 35);
    y += 60;

    doc.fillColor('#006633').fontSize(12).text(`CERTIFICADO Nº: ${numero}`, 50, y);
    doc.fontSize(10).fillColor('#666').text(`Data de Emissão: ${new Date(dados.emitidoEm).toLocaleDateString('pt-PT')}`, 50, y + 15);
    y += 40;

    // Responsável
    doc.fillColor('#006633').fontSize(12).text('RESPONSÁVEL PELA EMISSÃO:', 50, y);
    y += 20;
    doc.fillColor('#000').fontSize(11).text(`Nome: ${dados.laborantin?.nome || 'Não informado'}`, 70, y);
    y += 15;
    if (dados.laborantin?.registro) {
      doc.text(`Registro Profissional: ${dados.laborantin.registro}`, 70, y);
      y += 25;
    } else { y += 10; }

    // Paciente
    doc.fillColor('#006633').fontSize(12).text('DADOS DO PACIENTE:', 50, y);
    y += 20;
    doc.fillColor('#000').fontSize(11).text(`Nome: ${dados.paciente?.nomeCompleto || 'Não informado'}`, 70, y);
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
      doc.text(`Gênero: ${dados.paciente.genero === 'M' ? 'Masculino' : 'Feminino'}`, 70, y);
      y += 20;
    }

    // Dados médicos (simplificado, você pode expandir conforme necessário)
    doc.fillColor('#006633').fontSize(12).text('DADOS MÉDICOS:', 50, y);
    y += 20;
    const tipos = { 1: 'GENÓTIPO', 2: 'BOA SAÚDE', 3: 'INCAPACIDADE', 4: 'APTIDÃO', 5: 'SAÚDE MATERNA' };
    doc.fillColor('#333').fontSize(12).text(tipos[dados.tipo] || 'CERTIFICADO MÉDICO', 70, y);
    y += 25;

    if (dados.dados) {
      // Exemplo simples: listar todos os campos de dados
      for (let [chave, valor] of Object.entries(dados.dados)) {
        if (valor) {
          doc.fontSize(10).fillColor('#000').text(`• ${chave}: ${valor}`, 70, y);
          y += 15;
          if (y > 750) { doc.addPage(); y = 50; }
        }
      }
    }

    // Assinaturas
    y += 20;
    doc.lineWidth(1).moveTo(70, y).lineTo(270, y).stroke();
    doc.fontSize(10).text('Assinatura do Laborantin', 70, y + 5).text(dados.laborantin?.nome || '______', 70, y + 20);
    doc.lineWidth(1).moveTo(350, y).lineTo(550, y).stroke();
    doc.fontSize(10).text('Assinatura do Diretor Clínico', 350, y + 5).text(lab.diretor || '______', 350, y + 20);
    y += 50;

    // QR Code (se a biblioteca estiver disponível)
    try {
      const textoQR = `${numero}${lab.nome}${dados.paciente?.nomeCompleto || 'PACIENTE'}${new Date(dados.emitidoEm).toLocaleDateString('pt-PT')}`;
      const qrBuffer = await QRCode.toBuffer(textoQR, { errorCorrectionLevel: 'H', margin: 1, width: 100, color: { dark: '#006633', light: '#FFFFFF' } });
      const qrX = 310 - 50;
      const qrY = y - 20;
      doc.image(qrBuffer, qrX, qrY, { width: 100 });
      doc.fontSize(7).fillColor('#006633').text('SCAN PARA VERIFICAR', qrX, qrY - 12, { width: 100, align: 'center' });
      doc.fontSize(6).fillColor('#999').text('válido por QR', qrX, qrY + 110, { width: 100, align: 'center' });
    } catch (qrError) {
      console.error('Erro ao gerar QR:', qrError);
      doc.fontSize(7).fillColor('#999').text('QR indisponível', 280, y - 10);
    }

    doc.fontSize(8).fillColor('#666').text('Documento válido em todo território nacional', 0, 780, { align: 'center' });
    doc.end();

  } catch (error) {
    console.error('❌ Erro PDF:', error);
    res.status(500).json({ error: 'Erro ao gerar PDF: ' + error.message });
  }
});

// Geração de PDF para laboratório (admin)
app.post('/api/labs/pdf', authMiddleware, async (req, res) => {
  try {
    const labData = req.body;
    if (!labData || !labData.nome) {
      return res.status(400).json({ error: 'Dados do laboratório incompletos' });
    }

    const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `Laboratório ${labData.nome}`, Author: 'SNS Angola', Subject: 'Ficha de registo de laboratório' } });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=Laboratorio_${labData.nome.replace(/\s/g, '_')}.pdf`);
    doc.pipe(res);

    // Cabeçalho
    doc.fillColor('#006633');
    doc.fontSize(20).text('REPÚBLICA DE ANGOLA', 0, 50, { align: 'center' });
    doc.fontSize(16).text('MINISTÉRIO DA SAÚDE', 0, 80, { align: 'center' });
    doc.fontSize(24).text('SISTEMA NACIONAL DE SAÚDE', 0, 110, { align: 'center' });
    doc.strokeColor('#006633').lineWidth(2).moveTo(doc.page.width / 2 - 250, 150).lineTo(doc.page.width / 2 + 250, 150).stroke();

    let y = 180;
    doc.fillColor('#006633').fontSize(16).text('REGISTO DE LABORATÓRIO', 50, y);
    y += 30;

    const addLine = (label, value, defaultValue = 'Não informado') => {
      const displayValue = (value && value.toString().trim() !== '') ? value : defaultValue;
      if (y > 750) { doc.addPage(); y = 50; doc.fillColor('#006633').fontSize(12).text('SNS Angola - continuação', 50, y, { align: 'center' }); y += 30; }
      doc.fillColor('#000').fontSize(11).text(`${label}: ${displayValue}`, 70, y);
      y += 20;
    };

    addLine('ID do Laboratório', labData.labId);
    addLine('Nome', labData.nome);
    addLine('NIF', labData.nif);
    addLine('Tipo', labData.tipo);
    addLine('Província', labData.provincia);
    addLine('Município', labData.municipio);
    addLine('Endereço', labData.endereco);
    addLine('Telefone', labData.telefone || labData.telephone);
    addLine('Email', labData.email);
    addLine('Diretor', labData.diretor);
    addLine('Licença', labData.licenca);
    if (labData.expiracao) addLine('Validade da Licença', new Date(labData.expiracao).toLocaleDateString('pt-PT'));
    addLine('Status', labData.ativo ? 'Ativo' : 'Inativo');
    addLine('Total de Emissões', labData.totalEmissoes ?? 0);
    if (labData.createdAt) addLine('Data de Registo', new Date(labData.createdAt).toLocaleDateString('pt-PT'));

    y += 10;
    doc.fillColor('#b33').fontSize(12).text('CHAVE API (confidencial)', 70, y);
    y += 20;
    doc.fillColor('#000').fontSize(10).text(labData.apiKey || 'Não gerada', 70, y, { width: 400 });
    y += 30;
    doc.fillColor('#666').fontSize(9).text('Esta chave é pessoal e intransferível. Não a compartilhe.', 70, y);
    y += 30;

    doc.fontSize(8).fillColor('#666').text('Documento emitido pelo Sistema Nacional de Saúde de Angola', 0, 780, { align: 'center' });
    doc.end();

  } catch (error) {
    console.error('❌ Erro PDF laboratório:', error);
    res.status(500).json({ error: 'Erro ao gerar PDF' });
  }
});

// Páginas auxiliares (formulários)
app.get('/novo-certificado', (req, res) => {
  // Se você tiver um arquivo HTML separado, use res.sendFile; caso contrário, envie um formulário simples.
  res.send('<h1>Formulário de novo certificado (em construção)</h1><p>Esta página será implementada em breve.</p>');
});

app.get('/novo-laboratorio', (req, res) => {
  // Redireciona para o dashboard ou exibe mensagem
  res.redirect('/admin-dashboard');
});

// ============================================
// INICIALIZAÇÃO DO SERVIDOR
// ============================================
app.listen(PORT, () => {
  console.log(`🚀 SNS Online na porta ${PORT}`);
});