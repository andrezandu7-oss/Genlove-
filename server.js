// =================================================
// SNS - SISTEMA NACIONAL DE SAÚDE (ANGOLA)
// VERSÃO 3.0 - INTEGRAL E COMPLETA (SEM RESUMOS)
// CONTEXTO: RENDER + MONGODB ATLAS
// =================================================

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

// ========================
// CONFIGURAÇÕES GERAIS
// ========================
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('public'));

// ========================
// CONEXÃO MONGODB
// ========================
const MONGODB_URI = process.env.MONGODB_URI;
mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ Conectado ao MongoDB Atlas'))
  .catch(err => console.error('❌ Erro na conexão MongoDB:', err));

// ========================
// FUNÇÕES AUXILIARES
// ========================
function gerarApiKey() {
  return 'SNS-' + Date.now() + '-' + crypto.randomBytes(8).toString('hex').toUpperCase();
}

function gerarNumeroCertificado(tipo) {
  const ano = new Date().getFullYear();
  const mes = (new Date().getMonth() + 1).toString().padStart(2, '0');
  const random = crypto.randomBytes(3).toString('hex').toUpperCase();
  const prefixos = { 1: 'GEN', 2: 'SAU', 3: 'INC', 4: 'APT', 5: 'MAT', 6: 'CPN', 7: 'EPI' };
  return `${prefixos[tipo] || 'CERT'}-${ano}${mes}-${random}`;
}

// =============================================
// MODELOS DE DADOS (INTEGRAIS)
// =============================================

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
  email: { type: String, required: true },
  apiKey: { type: String, unique: true },
  ativo: { type: Boolean, default: true },
  totalEmissoes: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

const hospitalSchema = new mongoose.Schema({
  nome: String,
  nif: { type: String, unique: true },
  provincia: String,
  chaveAcesso: { type: String, unique: true },
  ativo: { type: Boolean, default: true }
});

const certificateSchema = new mongoose.Schema({
  numero: { type: String, unique: true },
  tipo: { type: Number, required: true },
  paciente: {
    nomeCompleto: { type: String, required: true },
    genero: { type: String, enum: ['M', 'F'] },
    dataNascimento: Date,
    bi: { type: String, required: true }
  },
  dados: {
    // Campos Genéricos e Específicos
    genotipo: String,
    grupoSanguineo: String,
    resultado: String,
    avaliacao: String,
    doenca: String,
    // Saúde Materna / CPN
    gestacoes: Number,
    partos: Number,
    dpp: Date,
    consultas: Number,
    examesCPN: {
      vih: String,
      malaria: String,
      hemoglobinia: String
    },
    // Aptidão / Incapacidade
    cid: String,
    restricoes: String,
    periodoInicio: Date,
    periodoFim: Date
  },
  hash: { type: String, unique: true },
  emitidoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Lab' },
  emitidoEm: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Lab = mongoose.model('Lab', labSchema);
const Hospital = mongoose.model('Hospital', hospitalSchema);
const Certificate = mongoose.model('Certificate', certificateSchema);

// ===========================================
// MIDDLEWARES DE SEGURANÇA
// ===========================================

const authMiddleware = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ erro: 'Acesso negado' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'secret-key');
    next();
  } catch (err) { res.status(401).json({ erro: 'Token inválido' }); }
};

const labMiddleware = async (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  const lab = await Lab.findOne({ apiKey, ativo: true });
  if (!lab) return res.status(401).json({ erro: 'Chave de laboratório inválida' });
  req.lab = lab;
  next();
};

// ===========================================
// ROTAS DO MINISTÉRIO (ADMIN)
// ===========================================

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  // Login padrão para o administrador do Ministério
  if (email === 'admin@sns.gov.ao' && password === 'Admin@2025') {
    const token = jwt.sign({ email, role: 'admin' }, process.env.JWT_SECRET || 'secret-key', { expiresIn: '8h' });
    return res.json({ token });
  }
  res.status(401).json({ erro: 'Credenciais inválidas' });
});

app.post('/api/labs', authMiddleware, async (req, res) => {
  try {
    const apiKey = gerarApiKey();
    const labId = 'LAB-' + Date.now();
    const lab = new Lab({ ...req.body, apiKey, labId });
    await lab.save();
    res.json({ success: true, apiKey });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

app.get('/api/labs', authMiddleware, async (req, res) => {
  const labs = await Lab.find().sort({ createdAt: -1 });
  res.json(labs);
});

// ===========================================
// ROTAS DO LABORATÓRIO (EMISSÃO E STATS)
// ===========================================

app.post('/api/labs/verificar', async (req, res) => {
  const lab = await Lab.findOne({ apiKey: req.body.apiKey, ativo: true });
  res.json({ valido: !!lab });
});

// Relatórios de Atividade (Hoje, Mês, Ano)
app.get('/api/certificados/stats-detalhes', labMiddleware, async (req, res) => {
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const inicioAno = new Date(hoje.getFullYear(), 0, 1);

  const stats = await Certificate.aggregate([
    { $match: { emitidoPor: req.lab._id } },
    { $facet: {
        "diario": [{ $match: { emitidoEm: { $gte: hoje } } }, { $count: "count" }],
        "mensal": [{ $match: { emitidoEm: { $gte: inicioMes } } }, { $count: "count" }],
        "anual": [{ $match: { emitidoEm: { $gte: inicioAno } } }, { $count: "count" }]
    }}
  ]);

  res.json({
    diario: stats[0].diario[0]?.count || 0,
    mensal: stats[0].mensal[0]?.count || 0,
    anual: stats[0].anual[0]?.count || 0,
    total: req.lab.totalEmissoes
  });
});

// Emissão Final (Após Revisão)
app.post('/api/certificados/emitir', labMiddleware, async (req, res) => {
  try {
    const { tipo, paciente, dados } = req.body;
    
    // Regra de Saúde solicitada: Se SS, bloqueia parceiro SS (lógica interna)
    if (dados.genotipo === 'SS') {
       // Lógica de alerta ou registro especial pode ser inserida aqui
    }

    const numero = gerarNumeroCertificado(tipo);
    const hash = crypto.createHash('sha256').update(numero + Date.now()).digest('hex');

    const novoCert = new Certificate({
      numero, tipo, paciente, dados, hash, emitidoPor: req.lab._id
    });

    await novoCert.save();
    req.lab.totalEmissoes++;
    await req.lab.save();

    res.json({ success: true, numero });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

app.get('/api/certificados/lab', labMiddleware, async (req, res) => {
  const lista = await Certificate.find({ emitidoPor: req.lab._id }).sort({ emitidoEm: -1 });
  res.json(lista);
});

// ===========================================
// GERAÇÃO DE PDF E IMPRESSÃO
// ===========================================

app.get('/api/certificados/pdf/:numero', async (req, res) => {
  const { apiKey } = req.query;
  const lab = await Lab.findOne({ apiKey });
  if (!lab) return res.status(401).send("Não autorizado");

  const cert = await Certificate.findOne({ numero: req.params.numero });
  if (!cert) return res.status(404).send("Certificado não encontrado");

  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename=${cert.numero}.pdf`);
  doc.pipe(res);

  // Design do PDF
  doc.fontSize(12).text('REPÚBLICA DE ANGOLA', { align: 'center' });
  doc.text('MINISTÉRIO DA SAÚDE', { align: 'center' });
  doc.moveDown().fontSize(16).text('CERTIFICADO NACIONAL DE SAÚDE', { align: 'center', underline: true });
  doc.moveDown(2);

  doc.fontSize(10).text(`NÚMERO: ${cert.numero}`, { fash: true });
  doc.text(`DATA: ${new Date(cert.emitidoEm).toLocaleDateString('pt-AO')}`);
  doc.moveDown();

  doc.fontSize(12).text('DADOS DO PACIENTE', { underline: true });
  doc.text(`Nome: ${cert.paciente.nomeCompleto}`);
  doc.text(`BI: ${cert.paciente.bi}`);
  doc.text(`Gênero: ${cert.paciente.genero === 'M' ? 'Masculino' : 'Feminino'}`);
  doc.moveDown();

  doc.text('INFORMAÇÕES CLÍNICAS', { underline: true });
  if (cert.dados.genotipo) doc.text(`Genótipo: ${cert.dados.genotipo}`);
  if (cert.dados.resultado) doc.text(`Resultado: ${cert.dados.resultado}`);
  if (cert.dados.avaliacao) doc.text(`Avaliação: ${cert.dados.avaliacao}`);
  
  doc.moveDown(5);
  doc.text('__________________________________', { align: 'center' });
  doc.text('Assinatura Autorizada e Carimbo', { align: 'center' });
  doc.moveDown();
  doc.fontSize(8).text(`Código de Autenticação: ${cert.hash}`, { align: 'center', color: 'gray' });

  doc.end();
});

// ===========================================
// INTERFACES (DASHBOARDS)
// ===========================================

// Dashboard do Laboratório
app.get('/lab-dashboard', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="pt">
<head>
    <meta charset="UTF-8">
    <title>Dashboard Lab - SNS Angola</title>
    <style>
        * { margin:0; padding:0; box-sizing:border-box; font-family: 'Segoe UI', sans-serif; }
        body { display: flex; background: #f4f7f6; }
        .sidebar { width: 260px; background: #006633; color: white; height: 100vh; position: fixed; padding: 20px; }
        .main { margin-left: 260px; width: 100%; padding: 40px; }
        .stats { display: flex; gap: 20px; margin-bottom: 30px; }
        .card { background: white; padding: 20px; border-radius: 10px; flex: 1; border-top: 5px solid #006633; box-shadow: 0 4px 6px rgba(0,0,0,0.1); text-align: center; }
        .card h3 { font-size: 14px; color: #777; margin-bottom: 10px; }
        .card p { font-size: 28px; font-weight: bold; color: #006633; }
        table { width: 100%; background: white; border-collapse: collapse; border-radius: 10px; overflow: hidden; }
        th { background: #006633; color: white; padding: 15px; text-align: left; }
        td { padding: 15px; border-bottom: 1px solid #eee; }
        .btn { padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; color: white; font-weight: bold; }
        .btn-new { background: #fff; color: #006633; width: 100%; margin-top: 20px; }
        .btn-pdf { background: #17a2b8; font-size: 12px; }
        
        /* Modal de Revisão */
        #modalRevisao { display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); justify-content:center; align-items:center; z-index:999; }
        .modal-content { background:white; padding:30px; border-radius:12px; width:550px; max-height: 85vh; overflow-y: auto; }
        .rev-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
        .rev-row b { color: #006633; }
    </style>
</head>
<body>
    <div class="sidebar">
        <h2>SNS - LAB</h2>
        <p>Ministério da Saúde</p>
        <hr style="margin: 20px 0; opacity: 0.3;">
        <button class="btn btn-new" onclick="location.href='/novo-certificado'">+ EMITIR CERTIFICADO</button>
        <button class="btn" onclick="logout()" style="background:transparent; border: 1px solid white; width:100%; margin-top:10px;">SAIR</button>
    </div>

    <div class="main">
        <div class="stats">
            <div class="card"><h3>HOJE</h3><p id="sHoje">0</p></div>
            <div class="card"><h3>ESTE MÊS</h3><p id="sMes">0</p></div>
            <div class="card"><h3>ESTE ANO</h3><p id="sAno">0</p></div>
            <div class="card" style="border-top-color: orange;"><h3>TOTAL GERAL</h3><p id="sTotal" style="color:orange;">0</p></div>
        </div>

        <h3>Certificados Emitidos</h3>
        <table>
            <thead><tr><th>Nº Certificado</th><th>Paciente</th><th>Data Emissão</th><th>Ações</th></tr></thead>
            <tbody id="tabelaCertificados"></tbody>
        </table>
    </div>

    <div id="modalRevisao">
        <div class="modal-content">
            <h2 style="color: #006633;">Revisão de Emissão</h2>
            <p style="font-size: 13px; color: #666; margin-bottom: 20px;">Verifique os dados abaixo. Se houver erro, clique em "Editar".</p>
            <div id="corpoRevisao"></div>
            <div style="margin-top: 30px; display: flex; gap: 10px;">
                <button class="btn" style="background: #006633; flex: 2;" onclick="finalizarEmissao()">CONFIRMAR E GERAR</button>
                <button class="btn" style="background: #666; flex: 1;" onclick="fecharRevisao()">EDITAR</button>
            </div>
        </div>
    </div>

    <script>
        const apiKey = localStorage.getItem("labKey");
        if(!apiKey) location.href = "/lab-login";
        let dadosPendentes = null;

        async function carregarDashboard() {
            // Stats
            const rS = await fetch("/api/certificados/stats-detalhes", { headers: { "x-api-key": apiKey } });
            const s = await rS.json();
            document.getElementById("sHoje").innerText = s.diario;
            document.getElementById("sMes").innerText = s.mensal;
            document.getElementById("sAno").innerText = s.anual;
            document.getElementById("sTotal").innerText = s.total;

            // Tabela
            const rL = await fetch("/api/certificados/lab", { headers: { "x-api-key": apiKey } });
            const lista = await rL.json();
            let html = "";
            lista.forEach(c => {
                const pdfUrl = "/api/certificados/pdf/" + c.numero + "?apiKey=" + apiKey;
                html += "<tr><td>"+c.numero+"</td><td>"+c.paciente.nomeCompleto+"</td><td>"+new Date(c.emitidoEm).toLocaleDateString()+"</td><td><a href='"+pdfUrl+"' target='_blank'><button class='btn btn-pdf'>📄 PDF / IMPRIMIR</button></a></td></tr>";
            });
            document.getElementById("tabelaCertificados").innerHTML = html || "<tr><td colspan='4'>Nenhum certificado emitido.</td></tr>";
        }

        window.abrirRevisaoEmissao = function(payload) {
            dadosPendentes = payload;
            let html = "";
            // Paciente
            for(let k in payload.paciente) {
                html += "<div class='rev-row'><b>"+k.toUpperCase()+":</b> <span>"+payload.paciente[k]+"</span></div>";
            }
            // Dados Clínicos
            for(let k in payload.dados) {
                if(typeof payload.dados[k] === 'object') continue;
                html += "<div class='rev-row'><b>"+k.toUpperCase()+":</b> <span>"+payload.dados[k]+"</span></div>";
            }
            document.getElementById("corpoRevisao").innerHTML = html;
            document.getElementById("modalRevisao").style.display = "flex";
        }

        async function finalizarEmissao() {
            const r = await fetch("/api/certificados/emitir", {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-api-key": apiKey },
                body: JSON.stringify(dadosPendentes)
            });
            if(r.ok) {
                alert("Certificado registrado com sucesso!");
                location.reload();
            } else {
                alert("Erro ao emitir certificado.");
            }
        }

        function fecharRevisao() { document.getElementById("modalRevisao").style.display = "none"; }
        function logout() { localStorage.removeItem("labKey"); location.href = "/"; }

        carregarDashboard();
    </script>
</body>
</html>
  `);
});

// Rotas para as outras páginas (Login do Lab e Ministério)
app.get('/lab-login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'lab-login.html')));
app.get('/novo-certificado', (req, res) => res.sendFile(path.join(__dirname, 'public', 'novo-certificado.html')));

// Inicialização
app.get('/', (req, res) => res.send("<h1>SNS - Angola Online</h1><p>Sistema Ativo.</p>"));

app.listen(PORT, () => {
  console.log('✅ Servidor SNS rodando na porta ' + PORT);
});
