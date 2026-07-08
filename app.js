import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  getDocs,
  addDoc,
  setDoc,
  doc,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBcUdKaMCHHqMCChJS_Zr2g2Sovabdgsmo",
  authDomain: "jarvis-sync-aa367.firebaseapp.com",
  projectId: "jarvis-sync-aa367",
  storageBucket: "jarvis-sync-aa367.firebasestorage.app",
  messagingSenderId: "530160642815",
  appId: "1:530160642815:web:0a2980e07edfc2cd11faca",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

const NIVEL_ORDER = { emergencia: 0, urgente: 1, prioridade: 2 };
const NIVEL_LABEL = { emergencia: "emergência", urgente: "urgente", prioridade: "prioridade" };

const loginScreen = document.getElementById("login-screen");
const mainScreen = document.getElementById("main-screen");
const loginBtn = document.getElementById("login-btn");
const logoutBtn = document.getElementById("logout-btn");
const contextScreen = document.getElementById("context-screen");
const resultScreen = document.getElementById("result-screen");
const btnCelular = document.getElementById("btn-celular");
const btnPc = document.getElementById("btn-pc");
const backBtn = document.getElementById("back-btn");
const taskList = document.getElementById("task-list");

let allTasks = [];
let aprendizadoMap = {};
let currentContexto = null;
const DEVICE_LEARNABLE_CATEGORIAS = ["Pessoal", "Flow"];

// Firestore grava alguns campos (prazo, last_touched) como Timestamp nativo,
// mas documentos criados manualmente (ex: teste) podem ter string ISO. Aceita os dois.
function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

async function loadData() {
  const tarefasSnap = await getDocs(collection(db, "tarefas"));
  allTasks = tarefasSnap.docs
    .map((d) => d.data())
    .filter((t) => t.status === "fazer" || t.status === "fazendo");

  const aprendizadoSnap = await getDocs(collection(db, "aprendizado_dispositivo"));
  aprendizadoMap = {};
  aprendizadoSnap.docs.forEach((d) => {
    aprendizadoMap[d.id] = d.data();
  });
}

// Seção 5 do spec: default celular pra Pessoal/Flow, sujeito à correção do usuário.
function effectiveDevice(task) {
  if (task.dispositivo === "celular" && aprendizadoMap[task.categoria]?.celular_ok === false) {
    return "pc";
  }
  return task.dispositivo;
}

// Módulo âncora - desligado no v1 (seção 6, passo 2 / seção 11 do spec).
// Ponto de extensão: quando ativado, vai promover tarefas de preparo com base em config.ancoras.
function applyAncoras(tasks) {
  return tasks;
}

function rankTasks(contexto) {
  const filtered = allTasks.filter((t) => contexto === "pc" || effectiveDevice(t) === "celular");
  const withAncoras = applyAncoras(filtered);

  return withAncoras.slice().sort((a, b) => {
    const nivelDiff = (NIVEL_ORDER[a.nivel] ?? 99) - (NIVEL_ORDER[b.nivel] ?? 99);
    if (nivelDiff !== 0) return nivelDiff;

    const prazoA = toDate(a.prazo);
    const prazoB = toDate(b.prazo);
    if (prazoA && prazoB) return prazoA - prazoB;
    if (prazoA && !prazoB) return -1;
    if (!prazoA && prazoB) return 1;

    const touchedA = toDate(a.last_touched) || new Date(0);
    const touchedB = toDate(b.last_touched) || new Date(0);
    return touchedA - touchedB;
  });
}

function motivoLine(task, index) {
  const nivelLabel = NIVEL_LABEL[task.nivel] || task.nivel;
  if (index !== 0) return nivelLabel;

  const prazo = toDate(task.prazo);
  if (!prazo) return `${nivelLabel}, sem prazo definido`;

  const dias = Math.ceil((prazo - new Date()) / (1000 * 60 * 60 * 24));
  if (dias < 0) return `${nivelLabel}, prazo vencido há ${Math.abs(dias)} dia(s)`;
  if (dias === 0) return `${nivelLabel}, vence hoje`;
  return `${nivelLabel}, vence em ${dias} dia(s)`;
}

function renderTasks(contexto) {
  currentContexto = contexto;
  const ranked = rankTasks(contexto);
  taskList.innerHTML = "";

  if (ranked.length === 0) {
    taskList.innerHTML = '<p class="empty">Nada na fila. 🎉</p>';
    return;
  }

  ranked.slice(0, 4).forEach((task, i) => {
    const card = document.createElement("div");
    card.className = i === 0 ? "task-card top" : "task-card";

    const prazo = toDate(task.prazo);
    const prazoText = prazo ? prazo.toLocaleDateString("pt-BR") : "—";

    const showSoPc = contexto === "celular" && DEVICE_LEARNABLE_CATEGORIAS.includes(task.categoria);

    card.innerHTML = `
      <div class="task-header">
        <span class="nivel nivel-${task.nivel}">${task.nivel}</span>
        <span class="categoria">${task.categoria || "—"}</span>
      </div>
      <h3>${task.titulo}</h3>
      <p class="motivo">${motivoLine(task, i)}</p>
      <p class="prazo">Prazo: ${prazoText}</p>
      <a href="${task.link_notion}" target="_blank" class="btn-notion">Abrir no Notion</a>
      <div class="actions">
        <button class="btn-feito" data-id="${task.notion_id}">✅ Feito</button>
        ${showSoPc ? `<button class="btn-so-pc" data-categoria="${task.categoria}">Só PC</button>` : ""}
      </div>
      <div class="feito-form hidden" data-id="${task.notion_id}">
        <input type="number" min="1" placeholder="minutos" class="tempo-input">
        <button class="btn-confirmar-feito" data-id="${task.notion_id}" data-categoria="${task.categoria || ""}">Confirmar</button>
      </div>
    `;
    taskList.appendChild(card);
  });
}

taskList.addEventListener("click", async (e) => {
  if (e.target.classList.contains("btn-feito")) {
    const id = e.target.dataset.id;
    e.target.classList.add("hidden");
    taskList.querySelector(`.feito-form[data-id="${id}"]`).classList.remove("hidden");
    return;
  }

  if (e.target.classList.contains("btn-confirmar-feito")) {
    const id = e.target.dataset.id;
    const categoria = e.target.dataset.categoria || null;
    const form = e.target.closest(".feito-form");
    const minutos = parseInt(form.querySelector(".tempo-input").value, 10);

    if (!minutos || minutos <= 0) {
      alert("Informe um tempo válido em minutos.");
      return;
    }

    await addDoc(collection(db, "historico_tempo"), {
      notion_id: id,
      categoria,
      real_min: minutos,
      concluido_em: new Date().toISOString(),
    });

    allTasks = allTasks.filter((t) => t.notion_id !== id);
    renderTasks(currentContexto);
    return;
  }

  if (e.target.classList.contains("btn-so-pc")) {
    const categoria = e.target.dataset.categoria;

    await setDoc(doc(db, "aprendizado_dispositivo", categoria), {
      categoria,
      celular_ok: false,
      corrigido_em: new Date().toISOString(),
    });

    aprendizadoMap[categoria] = { categoria, celular_ok: false };
    renderTasks(currentContexto);
  }
});

loginBtn.addEventListener("click", () => {
  signInWithPopup(auth, provider).catch((err) => {
    console.error("[JARVIS] signInWithPopup erro:", err);
    alert("Erro no login: " + err.message);
  });
});

logoutBtn.addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  if (user) {
    loginScreen.classList.add("hidden");
    mainScreen.classList.remove("hidden");
    try {
      await loadData();
    } catch (err) {
      console.error("[JARVIS] erro no loadData:", err);
    }
  } else {
    loginScreen.classList.remove("hidden");
    mainScreen.classList.add("hidden");
  }
});

btnCelular.addEventListener("click", () => {
  contextScreen.classList.add("hidden");
  resultScreen.classList.remove("hidden");
  renderTasks("celular");
});

btnPc.addEventListener("click", () => {
  contextScreen.classList.add("hidden");
  resultScreen.classList.remove("hidden");
  renderTasks("pc");
});

backBtn.addEventListener("click", () => {
  resultScreen.classList.add("hidden");
  contextScreen.classList.remove("hidden");
});
