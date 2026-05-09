import {
  adicionarMovimentacao,
  atualizarMovimentacao,
  buscarMetaMensal,
  excluirMovimentacao,
  initDB,
  listarMovimentacoesUsuario,
  salvarMetaMensal,
} from "./db.js";
import {
  loginUsuario,
  logoutUsuario,
  obterUsuarioLogado,
  registrarUsuario,
} from "./auth.js";

const state = {
  usuario: null,
  movimentacoes: [],
  editandoId: null,
  chart: null,
  deferredPrompt: null,
};

let jsPdfLoadPromise = null;

const els = {
  authSection: document.getElementById("authSection"),
  appSection: document.getElementById("appSection"),
  showLoginBtn: document.getElementById("showLoginBtn"),
  showRegisterBtn: document.getElementById("showRegisterBtn"),
  loginForm: document.getElementById("loginForm"),
  registerForm: document.getElementById("registerForm"),
  userName: document.getElementById("userName"),
  logoutBtn: document.getElementById("logoutBtn"),
  saldoAtual: document.getElementById("saldoAtual"),
  totalReceitas: document.getElementById("totalReceitas"),
  totalDespesas: document.getElementById("totalDespesas"),
  qtdRegistros: document.getElementById("qtdRegistros"),
  movForm: document.getElementById("movForm"),
  movTipo: document.getElementById("movTipo"),
  movCategoria: document.getElementById("movCategoria"),
  movDescricao: document.getElementById("movDescricao"),
  movValor: document.getElementById("movValor"),
  movSubmitBtn: document.getElementById("movSubmitBtn"),
  cancelEditBtn: document.getElementById("cancelEditBtn"),
  historicoLista: document.getElementById("historicoLista"),
  filtroTipo: document.getElementById("filtroTipo"),
  filtroCategoria: document.getElementById("filtroCategoria"),
  filtroMes: document.getElementById("filtroMes"),
  imprimirRelatorioBtn: document.getElementById("imprimirRelatorioBtn"),
  baixarPdfBtn: document.getElementById("baixarPdfBtn"),
  metaForm: document.getElementById("metaForm"),
  metaMes: document.getElementById("metaMes"),
  metaValor: document.getElementById("metaValor"),
  metaStatus: document.getElementById("metaStatus"),
  metaResumo: document.getElementById("metaResumo"),
  metaProgress: document.getElementById("metaProgress"),
  toast: document.getElementById("toast"),
  installBtn: document.getElementById("installBtn"),
  navButtons: [...document.querySelectorAll("[data-view]")],
  views: {
    dashboard: document.getElementById("view-dashboard"),
    nova: document.getElementById("view-nova"),
    historico: document.getElementById("view-historico"),
    meta: document.getElementById("view-meta"),
  },
};

function formatarMoeda(valor) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(valor || 0));
}

function mesAtualISO() {
  const hoje = new Date();
  const mes = String(hoje.getMonth() + 1).padStart(2, "0");
  return `${hoje.getFullYear()}-${mes}`;
}

function formatarMesReferencia(mesISO) {
  if (!/^\d{4}-\d{2}$/.test(mesISO || "")) return mesISO || "-";
  const [ano, mes] = mesISO.split("-").map(Number);
  return new Date(ano, mes - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
}

function obterMesRelatorio() {
  return els.filtroMes.value || mesAtualISO();
}

function construirDadosRelatorioMensal(mes) {
  const movimentacoesMes = state.movimentacoes
    .filter((item) => item.data.slice(0, 7) === mes)
    .sort((a, b) => new Date(a.data) - new Date(b.data));

  const resumo = calcularResumo(movimentacoesMes);
  const despesas = movimentacoesMes.filter((item) => item.tipo === "despesa");

  return {
    mes,
    movimentacoesMes,
    despesas,
    totalReceitas: resumo.receitas,
    totalDespesas: resumo.despesas,
    saldo: resumo.receitas - resumo.despesas,
  };
}

function escapeHtml(texto) {
  return String(texto).replace(/[&<>"']/g, (char) => {
    const mapa = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return mapa[char];
  });
}

function montarHtmlRelatorio(relatorio) {
  const linhas = relatorio.despesas
    .map((item) => {
      const data = new Date(item.data).toLocaleDateString("pt-BR");
      return `<tr>
        <td>${escapeHtml(data)}</td>
        <td>${escapeHtml(item.categoria)}</td>
        <td>${escapeHtml(item.descricao)}</td>
        <td class="valor">${escapeHtml(formatarMoeda(item.valor))}</td>
      </tr>`;
    })
    .join("");

  const corpoTabela = linhas
    || '<tr><td colspan="4">Nenhum gasto encontrado para este mes.</td></tr>';

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <title>Relatorio mensal de gastos</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 24px; color: #111827; }
      h1 { margin: 0 0 4px; font-size: 22px; }
      p { margin: 4px 0; }
      .muted { color: #4b5563; }
      .resumo { margin: 18px 0; padding: 12px; border: 1px solid #d1d5db; border-radius: 8px; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; }
      th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; font-size: 13px; }
      th { background: #f3f4f6; }
      .valor { text-align: right; white-space: nowrap; }
    </style>
  </head>
  <body>
    <h1>Relatorio mensal de gastos</h1>
    <p class="muted">Mes de referencia: ${escapeHtml(formatarMesReferencia(relatorio.mes))}</p>
    <div class="resumo">
      <p><strong>Total de receitas:</strong> ${escapeHtml(formatarMoeda(relatorio.totalReceitas))}</p>
      <p><strong>Total de despesas:</strong> ${escapeHtml(formatarMoeda(relatorio.totalDespesas))}</p>
      <p><strong>Saldo do mes:</strong> ${escapeHtml(formatarMoeda(relatorio.saldo))}</p>
      <p><strong>Quantidade de gastos:</strong> ${escapeHtml(String(relatorio.despesas.length))}</p>
    </div>
    <table>
      <thead>
        <tr>
          <th>Data</th>
          <th>Categoria</th>
          <th>Descricao</th>
          <th>Valor</th>
        </tr>
      </thead>
      <tbody>
        ${corpoTabela}
      </tbody>
    </table>
  </body>
</html>`;
}

function imprimirRelatorioMensal() {
  const relatorio = construirDadosRelatorioMensal(obterMesRelatorio());

  if (!relatorio.movimentacoesMes.length) {
    toast("Nao ha movimentacoes para o mes selecionado");
    return;
  }

  const janela = window.open("", "_blank", "width=900,height=700");
  if (!janela) {
    toast("Ative pop-up para imprimir o relatorio");
    return;
  }

  janela.document.open();
  janela.document.write(montarHtmlRelatorio(relatorio));
  janela.document.close();
  janela.focus();
  janela.onload = () => janela.print();
}

function carregarJsPDF() {
  if (window.jspdf?.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
  if (jsPdfLoadPromise) return jsPdfLoadPromise;

  jsPdfLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js";
    script.onload = () => {
      if (window.jspdf?.jsPDF) {
        resolve(window.jspdf.jsPDF);
        return;
      }
      reject(new Error("Biblioteca jsPDF indisponivel"));
    };
    script.onerror = () => reject(new Error("Falha ao carregar jsPDF"));
    document.head.appendChild(script);
  });

  return jsPdfLoadPromise;
}

async function baixarRelatorioMensalPdf() {
  const relatorio = construirDadosRelatorioMensal(obterMesRelatorio());

  if (!relatorio.movimentacoesMes.length) {
    toast("Nao ha movimentacoes para o mes selecionado");
    return;
  }

  try {
    const jsPDF = await carregarJsPDF();
    const doc = new jsPDF({ unit: "pt", format: "a4" });

    const paginaLargura = doc.internal.pageSize.getWidth();
    const paginaAltura = doc.internal.pageSize.getHeight();
    const margem = 40;
    const areaUtil = paginaLargura - margem * 2;
    let y = margem;

    const garantirEspaco = (altura) => {
      if (y + altura <= paginaAltura - margem) return;
      doc.addPage();
      y = margem;
    };

    const escreverBloco = (texto, fonte = "normal", tamanho = 11, gap = 16) => {
      doc.setFont("helvetica", fonte);
      doc.setFontSize(tamanho);
      const linhas = doc.splitTextToSize(String(texto), areaUtil);
      const altura = linhas.length * (tamanho + 3) * 0.75 + gap;
      garantirEspaco(altura);
      doc.text(linhas, margem, y);
      y += linhas.length * (tamanho + 3) * 0.75 + gap;
    };

    escreverBloco("Relatorio mensal de gastos", "bold", 18, 10);
    escreverBloco(`Mes de referencia: ${formatarMesReferencia(relatorio.mes)}`, "normal", 12, 12);
    escreverBloco(`Total de receitas: ${formatarMoeda(relatorio.totalReceitas)}`, "normal", 11, 8);
    escreverBloco(`Total de despesas: ${formatarMoeda(relatorio.totalDespesas)}`, "normal", 11, 8);
    escreverBloco(`Saldo do mes: ${formatarMoeda(relatorio.saldo)}`, "normal", 11, 12);
    escreverBloco(`Quantidade de gastos: ${relatorio.despesas.length}`, "normal", 11, 16);
    escreverBloco("Detalhamento de gastos", "bold", 13, 12);

    if (!relatorio.despesas.length) {
      escreverBloco("Nenhum gasto encontrado para este mes.", "normal", 11, 8);
    } else {
      relatorio.despesas.forEach((item, index) => {
        const data = new Date(item.data).toLocaleDateString("pt-BR");
        escreverBloco(`${index + 1}. ${item.descricao}`, "bold", 11, 4);
        escreverBloco(`Data: ${data} | Categoria: ${item.categoria}`, "normal", 10, 4);
        escreverBloco(`Valor: ${formatarMoeda(item.valor)}`, "normal", 10, 10);
      });
    }

    doc.save(`relatorio-gastos-${relatorio.mes}.pdf`);
    toast("PDF gerado com sucesso");
  } catch (error) {
    toast("Nao foi possivel baixar PDF. Use Imprimir relatorio mensal");
  }
}

function toast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.remove("hidden");
  setTimeout(() => els.toast.classList.add("hidden"), 2500);
}

function alternarAuthTela(tipo) {
  const loginAtivo = tipo === "login";
  els.loginForm.classList.toggle("hidden", !loginAtivo);
  els.registerForm.classList.toggle("hidden", loginAtivo);
  els.showLoginBtn.classList.toggle("active", loginAtivo);
  els.showRegisterBtn.classList.toggle("active", !loginAtivo);
}

function mostrarAppLogado(usuario) {
  state.usuario = usuario;
  els.userName.textContent = usuario.nome;
  els.authSection.classList.add("hidden");
  els.appSection.classList.remove("hidden");
}

function mostrarAuth() {
  state.usuario = null;
  els.authSection.classList.remove("hidden");
  els.appSection.classList.add("hidden");
}

function trocarView(view) {
  Object.entries(els.views).forEach(([key, node]) => {
    node.classList.toggle("hidden", key !== view);
  });

  els.navButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === view);
  });
}

function calcularResumo(movimentacoes) {
  return movimentacoes.reduce(
    (acc, item) => {
      const valor = Number(item.valor);
      if (item.tipo === "receita") acc.receitas += valor;
      if (item.tipo === "despesa") acc.despesas += valor;
      return acc;
    },
    { receitas: 0, despesas: 0 }
  );
}

function renderDashboard() {
  const resumo = calcularResumo(state.movimentacoes);
  const saldo = resumo.receitas - resumo.despesas;

  els.saldoAtual.textContent = formatarMoeda(saldo);
  els.totalReceitas.textContent = formatarMoeda(resumo.receitas);
  els.totalDespesas.textContent = formatarMoeda(resumo.despesas);
  els.qtdRegistros.textContent = String(state.movimentacoes.length);
}

function filtrarMovimentacoes() {
  const tipo = els.filtroTipo.value;
  const categoria = els.filtroCategoria.value.trim().toLowerCase();
  const mes = els.filtroMes.value;

  return state.movimentacoes.filter((item) => {
    const okTipo = tipo ? item.tipo === tipo : true;
    const okCategoria = categoria
      ? item.categoria.toLowerCase().includes(categoria)
      : true;
    const okMes = mes ? item.data.slice(0, 7) === mes : true;
    return okTipo && okCategoria && okMes;
  });
}

function montarLinhaMov(item) {
  const data = new Date(item.data).toLocaleDateString("pt-BR");

  return `<li class="mov-item" data-id="${item.id}">
      <div class="mov-top">
        <strong>${item.descricao}</strong>
        <span class="tag ${item.tipo}">${item.tipo}</span>
      </div>
      <small class="muted">${item.categoria} • ${data}</small>
      <strong>${formatarMoeda(item.valor)}</strong>
      <div class="mov-actions">
        <button class="btn ghost" data-action="editar" type="button">Editar</button>
        <button class="btn danger" data-action="excluir" type="button">Excluir</button>
      </div>
    </li>`;
}

function renderHistorico() {
  const itens = filtrarMovimentacoes();
  if (!itens.length) {
    els.historicoLista.innerHTML = "<li class=\"muted\">Nenhuma movimentacao encontrada.</li>";
    return;
  }

  els.historicoLista.innerHTML = itens.map(montarLinhaMov).join("");
}

async function renderMeta() {
  const mes = els.metaMes.value || mesAtualISO();
  const meta = await buscarMetaMensal(state.usuario.id, mes);
  const despesasMes = state.movimentacoes
    .filter((m) => m.tipo === "despesa" && m.data.slice(0, 7) === mes)
    .reduce((acc, m) => acc + Number(m.valor), 0);

  if (!meta) {
    els.metaStatus.textContent = "Sem meta definida para o mes.";
    els.metaResumo.textContent = "Defina uma meta para acompanhar seu progresso.";
    els.metaProgress.style.width = "0%";
    return;
  }

  const limite = Number(meta.valor_meta);
  const percentual = limite > 0 ? Math.min((despesasMes / limite) * 100, 100) : 0;
  const restante = limite - despesasMes;

  els.metaProgress.style.width = `${percentual.toFixed(2)}%`;

  if (restante < 0) {
    els.metaStatus.textContent = "Saldo negativo para a meta";
  } else if (despesasMes <= limite) {
    els.metaStatus.textContent = "Meta atingida";
  } else {
    els.metaStatus.textContent = "Progresso da meta";
  }

  els.metaResumo.textContent = `Meta: ${formatarMoeda(limite)} | Gasto: ${formatarMoeda(
    despesasMes
  )} | Restante: ${formatarMoeda(restante)}`;
}

function agruparPorMes() {
  const mapa = new Map();

  for (const mov of state.movimentacoes) {
    const mes = mov.data.slice(0, 7);
    if (!mapa.has(mes)) mapa.set(mes, { receita: 0, despesa: 0 });

    const atual = mapa.get(mes);
    atual[mov.tipo] += Number(mov.valor);
  }

  return [...mapa.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([mes, val]) => ({
      mes,
      receita: val.receita,
      despesa: val.despesa,
      saldo: val.receita - val.despesa,
    }));
}

function renderChart() {
  const serie = agruparPorMes();
  const labels = serie.map((i) => i.mes);
  const saldoData = serie.map((i) => i.saldo);

  if (state.chart) {
    state.chart.destroy();
  }

  const canvas = document.getElementById("evolucaoChart");
  if (!canvas || typeof Chart === "undefined") return;

  state.chart = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Saldo mensal",
          data: saldoData,
          borderColor: "#22c55e",
          backgroundColor: "rgba(34,197,94,0.2)",
          tension: 0.32,
          fill: true,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { labels: { color: "#e2e8f0" } },
      },
      scales: {
        x: {
          ticks: { color: "#94a3b8" },
          grid: { color: "rgba(148,163,184,0.15)" },
        },
        y: {
          ticks: { color: "#94a3b8" },
          grid: { color: "rgba(148,163,184,0.15)" },
        },
      },
    },
  });
}

async function atualizarTudo() {
  state.movimentacoes = await listarMovimentacoesUsuario(state.usuario.id);
  renderDashboard();
  renderHistorico();
  await renderMeta();
  renderChart();
}

function limparFormularioMov() {
  state.editandoId = null;
  els.movForm.reset();
  els.movSubmitBtn.textContent = "Salvar movimentacao";
  els.cancelEditBtn.classList.add("hidden");
}

function preencherParaEdicao(item) {
  state.editandoId = item.id;
  els.movTipo.value = item.tipo;
  els.movCategoria.value = item.categoria;
  els.movDescricao.value = item.descricao;
  els.movValor.value = item.valor;
  els.movSubmitBtn.textContent = "Atualizar movimentacao";
  els.cancelEditBtn.classList.remove("hidden");
  trocarView("nova");
}

async function tratarHistoricoClick(event) {
  const btn = event.target.closest("button[data-action]");
  if (!btn) return;

  const li = event.target.closest("li[data-id]");
  if (!li) return;

  const id = Number(li.dataset.id);
  const mov = state.movimentacoes.find((m) => m.id === id);
  if (!mov) return;

  if (btn.dataset.action === "editar") {
    preencherParaEdicao(mov);
    return;
  }

  if (btn.dataset.action === "excluir") {
    const ok = confirm("Deseja excluir esta movimentacao?");
    if (!ok) return;
    await excluirMovimentacao(id);
    toast("Movimentacao excluida");
    await atualizarTudo();
  }
}

function configurarInstallPrompt() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.deferredPrompt = event;
    els.installBtn.classList.remove("hidden");
  });

  els.installBtn.addEventListener("click", async () => {
    if (!state.deferredPrompt) return;
    state.deferredPrompt.prompt();
    await state.deferredPrompt.userChoice;
    state.deferredPrompt = null;
    els.installBtn.classList.add("hidden");
  });
}

function registrarServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {
      toast("Nao foi possivel registrar o modo offline");
    });
  }
}

function bindEvents() {
  els.showLoginBtn.addEventListener("click", () => alternarAuthTela("login"));
  els.showRegisterBtn.addEventListener("click", () => alternarAuthTela("register"));

  els.registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const nome = document.getElementById("registerNome").value;
    const email = document.getElementById("registerEmail").value;
    const senha = document.getElementById("registerSenha").value;

    try {
      await registrarUsuario({ nome, email, senha });
      toast("Conta criada com sucesso");
      alternarAuthTela("login");
      els.loginForm.querySelector("#loginEmail").value = email;
      els.loginForm.querySelector("#loginSenha").value = "";
    } catch (error) {
      toast(error.message || "Erro ao cadastrar");
    }
  });

  els.loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("loginEmail").value;
    const senha = document.getElementById("loginSenha").value;

    try {
      const usuario = await loginUsuario({ email, senha });
      mostrarAppLogado(usuario);
      await atualizarTudo();
      toast("Login realizado");
    } catch (error) {
      toast(error.message || "Falha no login");
    }
  });

  els.logoutBtn.addEventListener("click", () => {
    logoutUsuario();
    mostrarAuth();
    toast("Sessao encerrada");
  });

  els.navButtons.forEach((btn) => {
    btn.addEventListener("click", async () => {
      trocarView(btn.dataset.view);
      if (btn.dataset.view === "meta") {
        await renderMeta();
      }
    });
  });

  els.movForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const tipo = els.movTipo.value;
    const categoria = els.movCategoria.value.trim();
    const descricao = els.movDescricao.value.trim();
    const valor = Number(els.movValor.value);

    if (!tipo || !categoria || !descricao || !(valor > 0)) {
      toast("Preencha todos os campos obrigatorios");
      return;
    }

    const payload = {
      usuario_id: state.usuario.id,
      tipo,
      categoria,
      descricao,
      valor,
      data: new Date().toISOString(),
    };

    if (state.editandoId) {
      await atualizarMovimentacao(state.editandoId, payload);
      toast("Movimentacao atualizada");
    } else {
      await adicionarMovimentacao(payload);
      toast("Movimentacao salva");
    }

    limparFormularioMov();
    await atualizarTudo();
    trocarView("historico");
  });

  els.cancelEditBtn.addEventListener("click", () => limparFormularioMov());

  els.historicoLista.addEventListener("click", (event) => {
    tratarHistoricoClick(event).catch(() => toast("Erro ao processar acao"));
  });

  [els.filtroTipo, els.filtroCategoria, els.filtroMes].forEach((input) => {
    input.addEventListener("input", () => renderHistorico());
  });

  els.imprimirRelatorioBtn.addEventListener("click", () => imprimirRelatorioMensal());
  els.baixarPdfBtn.addEventListener("click", () => {
    baixarRelatorioMensalPdf().catch(() => {
      toast("Erro ao gerar o PDF do relatorio");
    });
  });

  els.metaMes.value = mesAtualISO();

  els.metaForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const mes = els.metaMes.value;
    const valor_meta = Number(els.metaValor.value);

    if (!mes || !(valor_meta > 0)) {
      toast("Informe um valor de meta valido");
      return;
    }

    await salvarMetaMensal({
      usuario_id: state.usuario.id,
      mes,
      valor_meta,
    });

    toast("Meta mensal salva");
    await renderMeta();
  });
}

async function init() {
  await initDB();
  bindEvents();
  configurarInstallPrompt();
  registrarServiceWorker();

  const usuario = await obterUsuarioLogado();
  if (usuario) {
    mostrarAppLogado(usuario);
    await atualizarTudo();
  } else {
    mostrarAuth();
  }
}

init().catch(() => {
  toast("Erro ao iniciar aplicativo");
});
