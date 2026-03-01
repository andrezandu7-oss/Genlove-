// ============================================
// SNS - SISTEMA NACIONAL DE SAÚDE
// MINISTÉRIO DA SAÚDE - ANGOLA
// ============================================

const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const crypto = require('crypto');
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

function gerarNumeroCertificado(tipo) {
    const ano = new Date().getFullYear();
    const mes = (new Date().getMonth() + 1).toString().padStart(2, '0');
    const random = crypto.randomBytes(4).toString('hex').toUpperCase();
    return 'CERT-' + tipo + '-' + ano + mes + '-' + random;
}

function gerarDadosGenlove(paciente, dados) {
    const partes = paciente.nomeCompleto.split(' ');
    const prenom = partes[0] || '';
    const nom = partes.slice(1).join(' ') || '';
    const genre = paciente.genero || '';
    const genotype = dados.genotipo || '';
    const groupe = dados.grupoSanguineo || '';
    return prenom + '|' + nom + '|' + genre + '|' + genotype + '|' + groupe;
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
    tipo: { 
        type: String, 
        enum: ['laboratorio', 'hospital', 'clinica'],
        required: true 
    },
    provincia: { type: String, required: true },
    municipio: String,
    email: String,
    telefone: String,
    diretor: String,
    apiKey: { type: String, unique: true },
    ativo: { type: Boolean, default: true },
    totalEmissoes: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});

const certificateSchema = new mongoose.Schema({
    numero: { type: String, unique: true },
    tipo: { type: Number, required: true, enum: [1, 2, 3, 4, 5] },
    paciente: {
        nomeCompleto: { type: String, required: true },
        prenome: String,
        sobrenome: String,
        genero: { type: String, enum: ['M', 'F'] },
        dataNascimento: Date,
        bi: String,
        telefone: String,
        provincia: String
    },
    dados: {
        genotipo: String,
        grupoSanguineo: String,
        avaliacao: String,
        finalidade: [String],
        periodoInicio: Date,
        periodoFim: Date,
        diasIncapacidade: Number,
        tipoAptidao: String,
        restricoes: [String],
        obstetricos: {
            gestacoes: Number,
            partos: Number
        },
        dpp: Date,
        ig: Number
    },
    dadosGenlove: String,
    hash: { type: String, unique: true },
    emitidoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Lab' },
    emitidoEm: { type: Date, default: Date.now },
    validoAte: Date,
    ativo: { type: Boolean, default: true }
});

const User = mongoose.model('User', userSchema);
const Lab = mongoose.model('Lab', labSchema);
const Certificate = mongoose.model('Certificate', certificateSchema);

// ============================================
// MIDDLEWARE
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
// ROTA PRINCIPAL - LOGIN
// ============================================
app.get('/', (req, res) => {
    res.send('<!DOCTYPE html>' +
    '<html lang="pt">' +
    '<head><meta charset="UTF-8"><title>SNS - Login</title>' +
    '<style>' +
    'body{background:linear-gradient(135deg,#006633,#003300);height:100vh;display:flex;align-items:center;justify-content:center;font-family:Arial;}' +
    '.login-box{background:white;padding:40px;border-radius:10px;width:350px;box-shadow:0 10px 30px rgba(0,0,0,0.3);}' +
    'h1{color:#006633;text-align:center;margin-bottom:30px;}' +
    'input{width:100%;padding:12px;margin:10px 0;border:1px solid #ddd;border-radius:5px;}' +
    'button{width:100%;padding:12px;background:#006633;color:white;border:none;border-radius:5px;cursor:pointer;}' +
    'button:hover{background:#004d26;}' +
    '.error{color:red;text-align:center;margin-top:10px;display:none;}' +
    '</style>' +
    '</head>' +
    '<body>' +
    '<div class="login-box">' +
    '<h1>SNS - Angola</h1>' +
    '<div id="error" class="error"></div>' +
    '<input type="email" id="email" placeholder="Email" value="admin@sns.gov.ao">' +
    '<input type="password" id="password" placeholder="Senha" value="Admin@2025">' +
    '<button onclick="login()">Entrar</button>' +
    '</div>' +
    '<script>' +
    'async function login(){' +
    'const e=document.getElementById("email").value;' +
    'const s=document.getElementById("password").value;' +
    'const r=await fetch("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:e,password:s})});' +
    'const d=await r.json();' +
    'if(d.token){localStorage.setItem("token",d.token);window.location.href="/dashboard";}' +
    'else{document.getElementById("error").style.display="block";document.getElementById("error").innerText=d.erro||"Erro no login";}}' +
    '</script>' +
    '</body></html>');
});

// ============================================
// ROTA DO DASHBOARD
// ============================================
app.get('/dashboard', (req, res) => {
    res.send('<!DOCTYPE html>' +
    '<html lang="pt">' +
    '<head><meta charset="UTF-8"><title>Dashboard - SNS</title>' +
    '<style>' +
    'body{font-family:Arial;margin:0;display:flex;}' +
    '.sidebar{width:250px;background:#006633;color:white;height:100vh;padding:20px;position:fixed;}' +
    '.sidebar h2{margin-bottom:30px;}' +
    '.sidebar a{display:block;color:white;text-decoration:none;padding:10px;margin:5px 0;border-radius:5px;}' +
    '.sidebar a:hover{background:#004d26;}' +
    '.main{margin-left:290px;padding:30px;flex:1;}' +
    'button{background:#dc3545;color:white;border:none;padding:10px 20px;cursor:pointer;}' +
    '.btn-criar{background:#006633;color:white;border:none;padding:10px 20px;border-radius:5px;cursor:pointer;margin-bottom:20px;}' +
    '.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:20px;}' +
    '.stat-card{background:#f5f5f5;padding:20px;border-radius:5px;text-align:center;}' +
    '.stat-card h3{color:#666;margin-bottom:10px;}' +
    '.stat-card .value{font-size:24px;font-weight:bold;color:#006633;}' +
    'table{width:100%;background:white;border-radius:5px;overflow:hidden;box-shadow:0 2px 5px rgba(0,0,0,0.1);}' +
    'th{background:#006633;color:white;padding:12px;text-align:left;}' +
    'td{padding:10px;border-bottom:1px solid #eee;}' +
    '.modal{display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);align-items:center;justify-content:center;}' +
    '.modal-content{background:white;padding:30px;border-radius:10px;width:400px;max-height:80vh;overflow-y:auto;}' +
    '.modal-content input,.modal-content select,.modal-content textarea{width:100%;padding:8px;margin:10px 0;border:1px solid #ddd;border-radius:5px;}' +
    '.tipo-badge{padding:3px 10px;border-radius:15px;font-size:12px;}' +
    '.tipo1{background:#e3f2fd;color:#0d47a1;}' +
    '.tipo2{background:#e8f5e8;color:#1b5e20;}' +
    '.tipo3{background:#fff3e0;color:#e65100;}' +
    '.tipo4{background:#f3e5f5;color:#4a148c;}' +
    '.tipo5{background:#fce4ec;color:#880e4f;}' +
    '</style>' +
    '</head>' +
    '<body>' +
    '<div class="sidebar">' +
    '<h2>SNS</h2>' +
    '<a href="#" onclick="mostrarSecao(\'dashboard\')">📊 Dashboard</a>' +
    '<a href="#" onclick="mostrarSecao(\'labs\')">🏥 Laboratórios</a>' +
    '<a href="#" onclick="mostrarSecao(\'certificados\')">📋 Certificados</a>' +
    '<button onclick="logout()" style="margin-top:20px;background:#dc3545;width:100%;">Sair</button>' +
    '</div>' +
    '<div class="main">' +
    '<div id="secaoDashboard">' +
    '<h1>Dashboard</h1>' +
    '<div class="stats">' +
    '<div class="stat-card"><h3>Laboratórios</h3><div class="value" id="totalLabs">0</div></div>' +
    '<div class="stat-card"><h3>Certificados</h3><div class="value" id="totalCerts">0</div></div>' +
    '<div class="stat-card"><h3>Hoje</h3><div class="value" id="certsHoje">0</div></div>' +
    '</div>' +
    '<div class="stats" style="grid-template-columns:repeat(5,1fr);">' +
    '<div class="stat-card"><h3>🧬 Genótipo</h3><div class="value" id="tipo1">0</div></div>' +
    '<div class="stat-card"><h3>🩺 Boa Saúde</h3><div class="value" id="tipo2">0</div></div>' +
    '<div class="stat-card"><h3>📋 Incapacidade</h3><div class="value" id="tipo3">0</div></div>' +
    '<div class="stat-card"><h3>💪 Aptidão</h3><div class="value" id="tipo4">0</div></div>' +
    '<div class="stat-card"><h3>🤰 Materno</h3><div class="value" id="tipo5">0</div></div>' +
    '</div>' +
    '</div>' +
    '<div id="secaoLabs" style="display:none;">' +
    '<h1>Laboratórios</h1>' +
    '<button class="btn-criar" onclick="mostrarModalLab()">+ Novo Laboratório</button>' +
    '<table><thead><tr><th>ID</th><th>Nome</th><th>Tipo</th><th>Província</th><th>Status</th><th>Ações</th></tr></thead>' +
    '<tbody id="labsBody"></tbody></table>' +
    '</div>' +
    '<div id="secaoCertificados" style="display:none;">' +
    '<h1>Certificados</h1>' +
    '<div style="margin-bottom:20px;">' +
    '<select id="tipoCertificado" style="padding:10px;margin-right:10px;">' +
    '<option value="1">🧬 Genótipo</option>' +
    '<option value="2">🩺 Boa Saúde</option>' +
    '<option value="3">📋 Incapacidade</option>' +
    '<option value="4">💪 Aptidão</option>' +
    '<option value="5">🤰 Saúde Materna</option>' +
    '</select>' +
    '<button class="btn-criar" onclick="mostrarModalCertificado()">+ Novo Certificado</button>' +
    '</div>' +
    '<table><thead><tr><th>Número</th><th>Tipo</th><th>Paciente</th><th>Emissão</th><th>Validade</th><th>Status</th></tr></thead>' +
    '<tbody id="certificadosBody"></tbody></table>' +
    '</div>' +
    '</div>' +

    // Modal Laboratório
    '<div id="modalLab" class="modal">' +
    '<div class="modal-content">' +
    '<h2>Novo Laboratório</h2>' +
    '<input type="text" id="labNome" placeholder="Nome do laboratório">' +
    '<select id="labTipo"><option value="laboratorio">Laboratório</option><option value="hospital">Hospital</option><option value="clinica">Clínica</option></select>' +
    '<input type="text" id="labProvincia" placeholder="Província">' +
    '<input type="text" id="labMunicipio" placeholder="Município">' +
    '<input type="email" id="labEmail" placeholder="Email">' +
    '<button onclick="criarLaboratorio()" style="background:#006633;color:white;padding:10px;width:100%;">Criar</button>' +
    '<button onclick="fecharModal(\'modalLab\')" style="margin-top:10px;">Cancelar</button>' +
    '</div>' +
    '</div>' +

    // Modal Certificado Genótipo
    '<div id="modalCertificado1" class="modal">' +
    '<div class="modal-content">' +
    '<h2>🧬 Novo Certificado - Genótipo</h2>' +
    '<input type="text" id="certNome" placeholder="Nome completo do paciente">' +
    '<select id="certGenero"><option value="M">Masculino</option><option value="F">Feminino</option></select>' +
    '<input type="date" id="certDataNasc" placeholder="Data nascimento">' +
    '<input type="text" id="certBI" placeholder="Nº do BI">' +
    '<select id="certGenotipo"><option value="AA">AA</option><option value="AS">AS</option><option value="SS">SS</option></select>' +
    '<select id="certGrupo"><option value="A+">A+</option><option value="A-">A-</option><option value="B+">B+</option><option value="B-">B-</option><option value="AB+">AB+</option><option value="AB-">AB-</option><option value="O+">O+</option><option value="O-">O-</option></select>' +
    '<button onclick="emitirCertificado(1)" style="background:#006633;color:white;padding:10px;width:100%;">Emitir</button>' +
    '<button onclick="fecharModal(\'modalCertificado1\')" style="margin-top:10px;">Cancelar</button>' +
    '</div>' +
    '</div>' +

    // Modal Certificado Boa Saúde
    '<div id="modalCertificado2" class="modal">' +
    '<div class="modal-content">' +
    '<h2>🩺 Novo Certificado - Boa Saúde</h2>' +
    '<input type="text" id="cert2Nome" placeholder="Nome completo do paciente">' +
    '<select id="cert2Genero"><option value="M">Masculino</option><option value="F">Feminino</option></select>' +
    '<input type="date" id="cert2DataNasc" placeholder="Data nascimento">' +
    '<input type="text" id="cert2BI" placeholder="Nº do BI">' +
    '<select id="cert2Avaliacao"><option value="APTO">APTO</option><option value="INAPTO">INAPTO</option></select>' +
    '<input type="text" id="cert2Finalidade" placeholder="Finalidade (ex: Emprego, Escola)">' +
    '<button onclick="emitirCertificado(2)" style="background:#006633;color:white;padding:10px;width:100%;">Emitir</button>' +
    '<button onclick="fecharModal(\'modalCertificado2\')" style="margin-top:10px;">Cancelar</button>' +
    '</div>' +
    '</div>' +

    // Modal Certificado Incapacidade
    '<div id="modalCertificado3" class="modal">' +
    '<div class="modal-content">' +
    '<h2>📋 Novo Certificado - Incapacidade</h2>' +
    '<input type="text" id="cert3Nome" placeholder="Nome completo do paciente">' +
    '<select id="cert3Genero"><option value="M">Masculino</option><option value="F">Feminino</option></select>' +
    '<input type="date" id="cert3DataNasc" placeholder="Data nascimento">' +
    '<input type="text" id="cert3BI" placeholder="Nº do BI">' +
    '<input type="date" id="cert3Inicio" placeholder="Data início">' +
    '<input type="date" id="cert3Fim" placeholder="Data fim">' +
    '<input type="text" id="cert3Recomendacoes" placeholder="Recomendações">' +
    '<button onclick="emitirCertificado(3)" style="background:#006633;color:white;padding:10px;width:100%;">Emitir</button>' +
    '<button onclick="fecharModal(\'modalCertificado3\')" style="margin-top:10px;">Cancelar</button>' +
    '</div>' +
    '</div>' +

    // Modal Certificado Aptidão
    '<div id="modalCertificado4" class="modal">' +
    '<div class="modal-content">' +
    '<h2>💪 Novo Certificado - Aptidão</h2>' +
    '<input type="text" id="cert4Nome" placeholder="Nome completo do paciente">' +
    '<select id="cert4Genero"><option value="M">Masculino</option><option value="F">Feminino</option></select>' +
    '<input type="date" id="cert4DataNasc" placeholder="Data nascimento">' +
    '<input type="text" id="cert4BI" placeholder="Nº do BI">' +
    '<select id="cert4Tipo"><option value="Profissional">Profissional</option><option value="Desportiva">Desportiva</option><option value="Escolar">Escolar</option></select>' +
    '<input type="text" id="cert4Restricoes" placeholder="Restrições">' +
    '<button onclick="emitirCertificado(4)" style="background:#006633;color:white;padding:10px;width:100%;">Emitir</button>' +
    '<button onclick="fecharModal(\'modalCertificado4\')" style="margin-top:10px;">Cancelar</button>' +
    '</div>' +
    '</div>' +

    // Modal Certificado Materno
    '<div id="modalCertificado5" class="modal">' +
    '<div class="modal-content">' +
    '<h2>🤰 Novo Certificado - Saúde Materna</h2>' +
    '<input type="text" id="cert5Nome" placeholder="Nome completo da paciente">' +
    '<input type="date" id="cert5DataNasc" placeholder="Data nascimento">' +
    '<input type="text" id="cert5BI" placeholder="Nº do BI">' +
    '<input type="number" id="cert5Gestacoes" placeholder="Nº de gestações">' +
    '<input type="number" id="cert5Partos" placeholder="Nº de partos">' +
    '<input type="date" id="cert5DPP" placeholder="Data provável do parto">' +
    '<input type="number" id="cert5IG" placeholder="Idade gestacional (semanas)">' +
    '<button onclick="emitirCertificado(5)" style="background:#006633;color:white;padding:10px;width:100%;">Emitir</button>' +
    '<button onclick="fecharModal(\'modalCertificado5\')" style="margin-top:10px;">Cancelar</button>' +
    '</div>' +
    '</div>' +

    '<script>' +
    'const token=localStorage.getItem("token");' +
    'if(!token)window.location.href="/";' +
    
    // Funções gerais
    'function mostrarSecao(s){' +
    'document.getElementById("secaoDashboard").style.display="none";' +
    'document.getElementById("secaoLabs").style.display="none";' +
    'document.getElementById("secaoCertificados").style.display="none";' +
    'if(s==="dashboard"){document.getElementById("secaoDashboard").style.display="block";carregarStats();}' +
    'if(s==="labs"){document.getElementById("secaoLabs").style.display="block";carregarLabs();}' +
    'if(s==="certificados"){document.getElementById("secaoCertificados").style.display="block";carregarCertificados();}}' +

    'function mostrarModalLab(){document.getElementById("modalLab").style.display="flex";}' +
    'function mostrarModalCertificado(){' +
    'const tipo=document.getElementById("tipoCertificado").value;' +
    'fecharTodosModais();' +
    'document.getElementById("modalCertificado"+tipo).style.display="flex";}' +
    'function fecharModal(id){document.getElementById(id).style.display="none";}' +
    'function fecharTodosModais(){' +
    'for(let i=1;i<=5;i++)document.getElementById("modalCertificado"+i).style.display="none";' +
    'document.getElementById("modalLab").style.display="none";}' +

    // Laboratórios
    'async function criarLaboratorio(){' +
    'const lab={nome:document.getElementById("labNome").value,tipo:document.getElementById("labTipo").value,provincia:document.getElementById("labProvincia").value,municipio:document.getElementById("labMunicipio").value,email:document.getElementById("labEmail").value};' +
    'const r=await fetch("/api/labs",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},body:JSON.stringify(lab)});' +
    'const d=await r.json();' +
    'if(d.success){alert("✅ Laboratório criado! API Key: "+d.lab.apiKey);fecharModal("modalLab");carregarLabs();}' +
    'else alert("Erro: "+d.erro);}' +

    'async function carregarLabs(){' +
    'const r=await fetch("/api/labs",{headers:{"Authorization":"Bearer "+token}});' +
    'const labs=await r.json();' +
    'let html="";' +
    'labs.forEach(l=>{html+="<tr><td>"+(l.labId||"-")+"</td><td>"+l.nome+"</td><td>"+l.tipo+"</td><td>"+l.provincia+"</td><td>"+(l.ativo?"✅ Ativo":"❌ Inativo")+' +
    '"</td><td><button onclick=\'desativarLab(\\""+l._id+"\\")\'>Desativar</button></td></tr>";});' +
    'document.getElementById("labsBody").innerHTML=html;}' +

    'async function desativarLab(id){' +
    'if(!confirm("Tem certeza?"))return;' +
    'const r=await fetch("/api/labs/"+id,{method:"DELETE",headers:{"Authorization":"Bearer "+token}});' +
    'if(r.ok){alert("Laboratório desativado");carregarLabs();}}' +

    // Certificados
    'async function emitirCertificado(tipo){' +
    'let dados={};' +
    'let paciente={};' +
    'if(tipo===1){' +
    'paciente={nomeCompleto:document.getElementById("certNome").value,genero:document.getElementById("certGenero").value,dataNascimento:document.getElementById("certDataNasc").value,bi:document.getElementById("certBI").value};' +
    'dados={genotipo:document.getElementById("certGenotipo").value,grupoSanguineo:document.getElementById("certGrupo").value};}' +
    'else if(tipo===2){' +
    'paciente={nomeCompleto:document.getElementById("cert2Nome").value,genero:document.getElementById("cert2Genero").value,dataNascimento:document.getElementById("cert2DataNasc").value,bi:document.getElementById("cert2BI").value};' +
    'dados={avaliacao:document.getElementById("cert2Avaliacao").value,finalidade:document.getElementById("cert2Finalidade").value.split(",")};}' +
    'else if(tipo===3){' +
    'paciente={nomeCompleto:document.getElementById("cert3Nome").value,genero:document.getElementById("cert3Genero").value,dataNascimento:document.getElementById("cert3DataNasc").value,bi:document.getElementById("cert3BI").value};' +
    'dados={periodoInicio:document.getElementById("cert3Inicio").value,periodoFim:document.getElementById("cert3Fim").value,recomendacoes:[document.getElementById("cert3Recomendacoes").value]};}' +
    'else if(tipo===4){' +
    'paciente={nomeCompleto:document.getElementById("cert4Nome").value,genero:document.getElementById("cert4Genero").value,dataNascimento:document.getElementById("cert4DataNasc").value,bi:document.getElementById("cert4BI").value};' +
    'dados={tipoAptidao:document.getElementById("cert4Tipo").value,restricoes:[document.getElementById("cert4Restricoes").value]};}' +
    'else if(tipo===5){' +
    'paciente={nomeCompleto:document.getElementById("cert5Nome").value,dataNascimento:document.getElementById("cert5DataNasc").value,bi:document.getElementById("cert5BI").value};' +
    'dados={obstetricos:{gestacoes:document.getElementById("cert5Gestacoes").value,partos:document.getElementById("cert5Partos").value},dpp:document.getElementById("cert5DPP").value,ig:document.getElementById("cert5IG").value};}' +

    'const r=await fetch("/api/certificados/emitir/"+tipo,{' +
    'method:"POST",' +
    'headers:{"Content-Type":"application/json","x-api-key":prompt("Digite a API Key do laboratório:")},' +
    'body:JSON.stringify({paciente,dados})});' +
    'const data=await r.json();' +
    'if(data.success){' +
    'alert("✅ Certificado emitido!\\nNúmero: "+data.certificado.numero+"\\nGenlove: "+data.certificado.dadosGenlove);' +
    'fecharModal("modalCertificado"+tipo);' +
    'carregarCertificados();' +
    '} else alert("Erro: "+data.erro);' +
    '}' +

    'async function carregarCertificados(){' +
    'const r=await fetch("/api/certificados",{headers:{"Authorization":"Bearer "+token}});' +
    'const certs=await r.json();' +
    'let html="";' +
    'certs.forEach(c=>{' +
    'const tipos=["","🧬 Genótipo","🩺 Boa Saúde","📋 Incapacidade","💪 Aptidão","🤰 Materno"];' +
    'const valido=c.validoAte?new Date()<new Date(c.validoAte):true;' +
    'html+="<tr><td>"+c.numero+"</td><td><span class=\'tipo-badge tipo"+c.tipo+"\'>"+tipos[c.tipo]+"</span></td><td>"+c.paciente.nomeCompleto+"</td><td>"+new Date(c.emitidoEm).toLocaleDateString()+"</td><td>"+(c.validoAte?new Date(c.validoAte).toLocaleDateString():"Vitalício")+"</td><td>"+(valido?"✅ Válido":"❌ Expirado")+"</td></tr>";});' +
    'document.getElementById("certificadosBody").innerHTML=html;}' +

    // Estatísticas
    'async function carregarStats(){' +
    'const r=await fetch("/api/stats",{headers:{"Authorization":"Bearer "+token}});' +
    'const d=await r.json();' +
    'document.getElementById("totalLabs").innerText=d.totalLabs||0;' +
    'document.getElementById("totalCerts").innerText=d.totalCertificados||0;' +
    'document.getElementById("certsHoje").innerText=d.certificadosHoje||0;' +
    'if(d.certificadosPorTipo){' +
    'document.getElementById("tipo1").innerText=d.certificadosPorTipo.tipo1||0;' +
    'document.getElementById("tipo2").innerText=d.certificadosPorTipo.tipo2||0;' +
    'document.getElementById("tipo3").innerText=d.certificadosPorTipo.tipo3||0;' +
    'document.getElementById("tipo4").innerText=d.certificadosPorTipo.tipo4||0;' +
    'document.getElementById("tipo5").innerText=d.certificadosPorTipo.tipo5||0;}}' +

    'function logout(){localStorage.removeItem("token");window.location.href="/";}' +
    'mostrarSecao("dashboard");' +
    '</script>' +
    '</body></html>');
});

// ============================================
// API DE LOGIN
// ============================================
app.post('/api/login', async (req, res) => {
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
        
        res.json({ token, user: { nome: user.nome, email, role: user.role } });
    } else {
        res.status(401).json({ erro: 'Email ou senha incorretos' });
    }
});

// ============================================
// API DE LABORATÓRIOS
// ============================================
app.post('/api/labs', authMiddleware, async (req, res) => {
    try {
        const dados = req.body;
        const labId = 'LAB-' + Date.now();
        const apiKey = gerarApiKey();
        
        const lab = new Lab({ ...dados, labId, apiKey });
        await lab.save();
        
        res.json({ success: true, lab: { labId: lab.labId, nome: lab.nome, apiKey: lab.apiKey } });
    } catch (error) {
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

app.delete('/api/labs/:id', authMiddleware, async (req, res) => {
    try {
        await Lab.findByIdAndUpdate(req.params.id, { ativo: false });
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
        const partes = dados.paciente.nomeCompleto.split(' ');
        const prenome = partes[0];
        const sobrenome = partes.slice(1).join(' ');
        const dadosGenlove = gerarDadosGenlove(dados.paciente, dados.dados);
        
        let validoAte = null;
        const hoje = new Date();
        if (tipo === 2) validoAte = new Date(hoje.setMonth(hoje.getMonth() + 6));
        else if (tipo === 3) validoAte = dados.dados.periodoFim ? new Date(dados.dados.periodoFim) : null;
        else if (tipo === 4) validoAte = new Date(hoje.setFullYear(hoje.getFullYear() + 1));
        else if (tipo === 5) validoAte = dados.dados.dpp ? new Date(dados.dados.dpp) : null;
        
        const hash = crypto.createHash('sha256').update(numero + JSON.stringify(dados) + Date.now()).digest('hex');
        
        const certificado = new Certificate({
            numero,
            tipo,
            paciente: { ...dados.paciente, prenome, sobrenome },
            dados: dados.dados,
            dadosGenlove,
            hash,
            emitidoPor: req.lab._id,
            validoAte
        });
        
        await certificado.save();
        
        req.lab.totalEmissoes = (req.lab.totalEmissoes || 0) + 1;
        req.lab.ultimoAcesso = new Date();
        await req.lab.save();
        
        res.json({
            success: true,
            certificado: {
                numero: certificado.numero,
                tipo: certificado.tipo,
                dadosGenlove,
                hash,
                validoAte
            }
        });
        
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao emitir certificado' });
    }
});

app.get('/api/certificados', authMiddleware, async (req, res) => {
    try {
        const certs = await Certificate.find().sort({ emitidoEm: -1 }).limit(50);
        res.json(certs);
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao buscar certificados' });
    }
});

app.get('/api/certificados/:numero', async (req, res) => {
    try {
        const cert = await Certificate.findOne({ numero: req.params.numero }).populate('emitidoPor', 'nome');
        if (!cert) return res.status(404).json({ erro: 'Certificado não encontrado' });
        res.json(cert);
    } catch (error) {
        res.status(500).json({ erro: 'Erro interno' });
    }
});

app.post('/api/verificar', async (req, res) => {
    try {
        const { numero } = req.body;
        const cert = await Certificate.findOne({ numero }).populate('emitidoPor', 'nome');
        
        if (!cert) return res.json({ valido: false, mensagem: 'Certificado não encontrado' });
        
        const valido = cert.validoAte ? new Date() < cert.validoAte : true;
        res.json({
            valido,
            numero: cert.numero,
            tipo: cert.tipo,
            emitidoPor: cert.emitidoPor?.nome,
            emitidoEm: cert.emitidoEm,
            validoAte: cert.validoAte,
            mensagem: valido ? '✅ Certificado válido' : '❌ Certificado expirado'
        });
    } catch (error) {
        res.status(500).json({ erro: 'Erro interno' });
    }
});

app.post('/api/genlove/verificar', async (req, res) => {
    try {
        const { hash } = req.body;
        const apiKey = req.headers['x-api-key'];
        
        if (apiKey !== 'GENLOVE-SECRET-2025') {
            return res.status(401).json({ erro: 'Não autorizado' });
        }
        
        const cert = await Certificate.findOne({ hash });
        if (!cert) return res.json({ valido: false });
        
        const valido = cert.validoAte ? new Date() < cert.validoAte : true;
        res.json({ valido, dados: cert.dadosGenlove, emitidoEm: cert.emitidoEm });
    } catch (error) {
        res.status(500).json({ erro: 'Erro interno' });
    }
});

// ============================================
// API DE ESTATÍSTICAS
// ============================================
app.get('/api/stats', authMiddleware, async (req, res) => {
    try {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        
        const stats = {
            totalLabs: await Lab.countDocuments({ ativo: true }),
            totalCertificados: await Certificate.countDocuments(),
            certificadosHoje: await Certificate.countDocuments({ emitidoEm: { $gte: hoje } }),
            certificadosPorTipo: {
                tipo1: await Certificate.countDocuments({ tipo: 1 }),
                tipo2: await Certificate.countDocuments({ tipo: 2 }),
                tipo3: await Certificate.countDocuments({ tipo: 3 }),
                tipo4: await Certificate.countDocuments({ tipo: 4 }),
                tipo5: await Certificate.countDocuments({ tipo: 5 })
            }
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
    console.log('👤 Login: admin@sns.gov.ao / Admin@2025');
    console.log('='.repeat(50) + '\n');
});