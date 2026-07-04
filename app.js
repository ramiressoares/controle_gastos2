import {
  adicionarMovimentacao,
  atualizarMovimentacao,
  buscarMetaMensal,
  excluirMovimentacao,
  initDB,
  listarMovimentacoesUsuario,
  listarMetasUsuario,
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
  metas: [],
  orcamentos: [],
  historicoFiltradoAtual: [],
  editandoId: null,
  orcamentoEditandoId: null,
  chart: null,
  resumoCharts: {
    pizza: null,
    barras: null,
    evolucao: null,
  },
  deferredPrompt: null,
  swRefreshing: false,
};

let jsPdfLoadPromise = null;
const ORCAMENTOS_STORAGE_PREFIX = "cf_orcamentos_usuario_";

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
  baixarPdfBtn: document.getElementById("baixarPdfBtn"),
  enviarWhatsappBtn: document.getElementById("enviarWhatsappBtn"),
  resumoHistoricoCard: document.getElementById("resumoHistoricoCard"),
  metaForm: document.getElementById("metaForm"),
  metaMes: document.getElementById("metaMes"),
  metaValor: document.getElementById("metaValor"),
  metaStatus: document.getElementById("metaStatus"),
  metaResumo: document.getElementById("metaResumo"),
  metaProgress: document.getElementById("metaProgress"),
  chartInsight: document.getElementById("chartInsight"),
  orcamentoForm: document.getElementById("orcamentoForm"),
  orcamentoMes: document.getElementById("orcamentoMes"),
  orcamentoCategoria: document.getElementById("orcamentoCategoria"),
  orcamentoValor: document.getElementById("orcamentoValor"),
  orcamentoSubmitBtn: document.getElementById("orcamentoSubmitBtn"),
  cancelOrcamentoEditBtn: document.getElementById("cancelOrcamentoEditBtn"),
  orcamentosLista: document.getElementById("orcamentosLista"),
  orcamentoCategoriasList: document.getElementById("orcamentoCategoriasList"),
  resumoMes: document.getElementById("resumoMes"),
  resumoCards: document.getElementById("resumoCards"),
  resumoTop5: document.getElementById("resumoTop5"),
  resumoPizzaChart: document.getElementById("resumoPizzaChart"),
  resumoBarrasChart: document.getElementById("resumoBarrasChart"),
  resumoEvolucaoChart: document.getElementById("resumoEvolucaoChart"),
  toast: document.getElementById("toast"),
  installBtn: document.getElementById("installBtn"),
  navButtons: [...document.querySelectorAll("[data-view]")],
  views: {
    dashboard: document.getElementById("view-dashboard"),
    nova: document.getElementById("view-nova"),
    historico: document.getElementById("view-historico"),
    meta: document.getElementById("view-meta"),
    orcamentos: document.getElementById("view-orcamentos"),
    resumo: document.getElementById("view-resumo"),
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

function normalizarTexto(texto) {
  return String(texto || "").trim().toLowerCase();
}

function obterMesAnterior(mesISO) {
  if (!/^\d{4}-\d{2}$/.test(mesISO || "")) return mesAtualISO();
  const [ano, mes] = mesISO.split("-").map(Number);
  const data = new Date(ano, mes - 1, 1);
  data.setMonth(data.getMonth() - 1);
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`;
}

function obterChaveOrcamentosUsuario(usuarioId) {
  return `${ORCAMENTOS_STORAGE_PREFIX}${usuarioId}`;
}

function carregarOrcamentosUsuario(usuarioId) {
  try {
    const salvo = localStorage.getItem(obterChaveOrcamentosUsuario(usuarioId));
    const itens = JSON.parse(salvo || "[]");
    if (!Array.isArray(itens)) return [];
    return itens.sort((a, b) => `${a.mes}-${a.categoria}`.localeCompare(`${b.mes}-${b.categoria}`));
  } catch {
    return [];
  }
}

function salvarOrcamentosUsuario(usuarioId, orcamentos) {
  localStorage.setItem(obterChaveOrcamentosUsuario(usuarioId), JSON.stringify(orcamentos));
}

function obterCategoriasUsuario() {
  return [...new Set(state.movimentacoes.map((item) => item.categoria.trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
}

function formatarTipoFiltro(tipo) {
  if (tipo === "receita") return "Receita";
  if (tipo === "despesa") return "Despesa";
  return "Todos";
}

function obterContextoFiltrosHistorico() {
  const tipo = els.filtroTipo.value;
  const categoria = els.filtroCategoria.value;
  const mes = els.filtroMes.value;

  return {
    tipo,
    categoria,
    mes,
    tipoLabel: formatarTipoFiltro(tipo),
    categoriaLabel: categoria || "Todas",
    mesLabel: mes ? formatarMesReferencia(mes) : "Todos os meses",
  };
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
  try {
    const arquivoPdf = await gerarArquivoRelatorioPdf();
    if (!arquivoPdf) return;

    baixarBlobPdf(arquivoPdf.blob, arquivoPdf.fileName);
    toast("PDF gerado com sucesso");
  } catch (error) {
    toast("Nao foi possivel baixar PDF");
  }
}

function baixarBlobPdf(blob, fileName) {
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}

async function gerarArquivoRelatorioPdf() {
  renderHistorico();

  const contexto = obterContextoFiltrosHistorico();
  const movimentacoes = [...state.historicoFiltradoAtual];

  if (!movimentacoes.length) {
    toast("Nao ha movimentacoes para os filtros selecionados");
    return null;
  }

  const resumo = calcularResumo(movimentacoes);
  const saldo = resumo.receitas - resumo.despesas;
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

  escreverBloco("Relatorio financeiro - Historico", "bold", 18, 10);
  escreverBloco(`Mes de referencia: ${contexto.mesLabel}`, "normal", 12, 8);
  escreverBloco(`Categoria: ${contexto.categoriaLabel}`, "normal", 11, 8);
  escreverBloco(`Tipo: ${contexto.tipoLabel}`, "normal", 11, 12);
  escreverBloco(`Total de receitas: ${formatarMoeda(resumo.receitas)}`, "normal", 11, 8);
  escreverBloco(`Total de despesas: ${formatarMoeda(resumo.despesas)}`, "normal", 11, 8);
  escreverBloco(`Saldo da selecao: ${formatarMoeda(saldo)}`, "normal", 11, 8);
  escreverBloco(`Quantidade de lancamentos exportados: ${movimentacoes.length}`, "normal", 11, 16);
  escreverBloco("Movimentacoes exportadas", "bold", 13, 12);

  movimentacoes.forEach((item, index) => {
    const data = new Date(item.data).toLocaleDateString("pt-BR");
    escreverBloco(`${index + 1}. ${item.descricao}`, "bold", 11, 4);
    escreverBloco(`Data: ${data} | Tipo: ${formatarTipoFiltro(item.tipo)} | Categoria: ${item.categoria}`, "normal", 10, 4);
    escreverBloco(`Valor: ${formatarMoeda(item.valor)}`, "normal", 10, 10);
  });

  const mesArquivo = contexto.mes || "todos-os-meses";
  const fileName = `relatorio-historico-${mesArquivo}.pdf`;
  const blob = doc.output("blob");
  const file = new File([blob], fileName, { type: "application/pdf" });

  return { file, blob, fileName, contexto };
}

async function enviarRelatorioWhatsapp() {
  try {
    const arquivoPdf = await gerarArquivoRelatorioPdf();
    if (!arquivoPdf) return;

    const texto = `Relatorio financeiro (${arquivoPdf.contexto.mesLabel} - ${arquivoPdf.contexto.categoriaLabel}).`;
    const suportaShareArquivos =
      typeof navigator !== "undefined"
      && typeof navigator.share === "function"
      && typeof navigator.canShare === "function"
      && navigator.canShare({ files: [arquivoPdf.file] });

    if (suportaShareArquivos) {
      await navigator.share({
        title: "Relatorio financeiro",
        text: texto,
        files: [arquivoPdf.file],
      });
      toast("Relatorio compartilhado com sucesso");
      return;
    }

    baixarBlobPdf(arquivoPdf.blob, arquivoPdf.fileName);
    window.open(
      `https://wa.me/?text=${encodeURIComponent(`${texto} Escolha um contato e anexe o PDF baixado automaticamente.`)}`,
      "_blank"
    );
    toast("WhatsApp aberto. Escolha um contato e anexe o PDF");
  } catch (error) {
    toast("Nao foi possivel enviar pelo WhatsApp");
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
  state.orcamentos = carregarOrcamentosUsuario(usuario.id);
  els.userName.textContent = usuario.nome;
  els.authSection.classList.add("hidden");
  els.appSection.classList.remove("hidden");
}

function mostrarAuth() {
  Object.keys(state.resumoCharts).forEach((chave) => destruirChartResumo(chave));
  state.usuario = null;
  state.orcamentos = [];
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
  const { tipo, categoria, mes } = obterContextoFiltrosHistorico();

  return state.movimentacoes.filter((item) => {
    const okTipo = tipo ? item.tipo === tipo : true;
    const okCategoria = categoria
      ? normalizarTexto(item.categoria) === normalizarTexto(categoria)
      : true;
    const okMes = mes ? item.data.slice(0, 7) === mes : true;
    return okTipo && okCategoria && okMes;
  });
}

function atualizarFiltroCategorias() {
  const categoriaSelecionada = els.filtroCategoria.value;
  const categorias = obterCategoriasUsuario();

  els.filtroCategoria.innerHTML = "";
  const opcaoTodas = document.createElement("option");
  opcaoTodas.value = "";
  opcaoTodas.textContent = "Todas";
  els.filtroCategoria.appendChild(opcaoTodas);

  categorias.forEach((categoria) => {
    const option = document.createElement("option");
    option.value = categoria;
    option.textContent = categoria;
    els.filtroCategoria.appendChild(option);
  });

  if (categoriaSelecionada && categorias.includes(categoriaSelecionada)) {
    els.filtroCategoria.value = categoriaSelecionada;
  }
}

function atualizarResumoHistoricoCard(itens) {
  const resumo = calcularResumo(itens);
  const saldo = resumo.receitas - resumo.despesas;
  const categoriaSelecionada = els.filtroCategoria.value;
  const titulo = categoriaSelecionada ? "Total da categoria:" : "Total geral do mes:";

  els.resumoHistoricoCard.innerHTML = `<p>${titulo} <strong>${formatarMoeda(saldo)}</strong></p>`;
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
  state.historicoFiltradoAtual = itens;
  atualizarResumoHistoricoCard(itens);

  if (!itens.length) {
    els.historicoLista.innerHTML = "<li class=\"muted\">Nenhuma movimentacao encontrada.</li>";
    return;
  }

  els.historicoLista.innerHTML = itens.map(montarLinhaMov).join("");
}

function atualizarDatalistCategoriasOrcamento() {
  const categorias = obterCategoriasUsuario();
  els.orcamentoCategoriasList.innerHTML = categorias
    .map((categoria) => `<option value="${categoria}"></option>`)
    .join("");
}

function obterGastoCategoriaMes(categoria, mes) {
  return state.movimentacoes
    .filter(
      (item) => item.tipo === "despesa"
        && item.data.slice(0, 7) === mes
        && normalizarTexto(item.categoria) === normalizarTexto(categoria)
    )
    .reduce((acc, item) => acc + Number(item.valor), 0);
}

function obterStatusOrcamento(percentual) {
  if (percentual <= 70) return { classe: "ok", cor: "#22c55e", label: "No limite" };
  if (percentual <= 100) return { classe: "warn", cor: "#f59e0b", label: "Atencao" };
  return { classe: "bad", cor: "#ef4444", label: "Acima do orcamento" };
}

function limparFormularioOrcamento() {
  state.orcamentoEditandoId = null;
  els.orcamentoForm.reset();
  els.orcamentoMes.value = mesAtualISO();
  els.orcamentoSubmitBtn.textContent = "Salvar orcamento";
  els.cancelOrcamentoEditBtn.classList.add("hidden");
}

function preencherOrcamentoParaEdicao(orcamento) {
  state.orcamentoEditandoId = orcamento.id;
  els.orcamentoMes.value = orcamento.mes;
  els.orcamentoCategoria.value = orcamento.categoria;
  els.orcamentoValor.value = orcamento.valor;
  els.orcamentoSubmitBtn.textContent = "Atualizar orcamento";
  els.cancelOrcamentoEditBtn.classList.remove("hidden");
}

function montarLinhaOrcamento(orcamento) {
  const gasto = obterGastoCategoriaMes(orcamento.categoria, orcamento.mes);
  const limite = Number(orcamento.valor || 0);
  const percentual = limite > 0 ? (gasto / limite) * 100 : 0;
  const percentualBarra = Math.min(percentual, 100);
  const restante = limite - gasto;
  const status = obterStatusOrcamento(percentual);

  return `<li class="orcamento-item" data-id="${orcamento.id}">
    <div class="orcamento-head">
      <strong>${orcamento.categoria} • ${formatarMesReferencia(orcamento.mes)}</strong>
      <span class="orcamento-status ${status.classe}">${status.label}</span>
    </div>
    <small class="muted">Orcamento: ${formatarMoeda(limite)} | Gasto: ${formatarMoeda(gasto)} | Restante: ${formatarMoeda(restante)}</small>
    <div class="progress-wrap orcamento">
      <div class="progress-bar orcamento" style="width:${percentualBarra.toFixed(2)}%; background:${status.cor};"></div>
    </div>
    <small class="muted">Consumo: ${percentual.toFixed(1)}%</small>
    <div class="mov-actions">
      <button class="btn ghost" data-action="editar" type="button">Editar</button>
      <button class="btn danger" data-action="excluir" type="button">Excluir</button>
    </div>
  </li>`;
}

function renderOrcamentos() {
  atualizarDatalistCategoriasOrcamento();

  if (!state.orcamentos.length) {
    els.orcamentosLista.innerHTML = "<li class=\"muted\">Nenhum orcamento cadastrado.</li>";
    return;
  }

  const itens = [...state.orcamentos].sort((a, b) => `${a.mes}-${a.categoria}`.localeCompare(`${b.mes}-${b.categoria}`));
  els.orcamentosLista.innerHTML = itens.map(montarLinhaOrcamento).join("");
}

async function tratarOrcamentoSubmit(event) {
  event.preventDefault();

  const mes = els.orcamentoMes.value;
  const categoria = els.orcamentoCategoria.value.trim();
  const valor = Number(els.orcamentoValor.value);

  if (!mes || !categoria || !(valor > 0)) {
    toast("Preencha os dados do orcamento corretamente");
    return;
  }

  const usuarioId = state.usuario.id;
  const id = state.orcamentoEditandoId || `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const outros = state.orcamentos.filter((item) => item.id !== id);

  const conflito = outros.some(
    (item) => item.mes === mes && normalizarTexto(item.categoria) === normalizarTexto(categoria)
  );

  if (conflito) {
    toast("Ja existe orcamento para esta categoria no mes informado");
    return;
  }

  const atualizado = {
    id,
    usuario_id: usuarioId,
    mes,
    categoria,
    valor,
    criado_em: new Date().toISOString(),
  };

  state.orcamentos = [...outros, atualizado];
  salvarOrcamentosUsuario(usuarioId, state.orcamentos);
  limparFormularioOrcamento();
  renderOrcamentos();
  toast("Orcamento salvo com sucesso");
}

function tratarOrcamentosClick(event) {
  const btn = event.target.closest("button[data-action]");
  if (!btn) return;

  const li = event.target.closest("li[data-id]");
  if (!li) return;

  const id = li.dataset.id;
  const orcamento = state.orcamentos.find((item) => item.id === id);
  if (!orcamento) return;

  if (btn.dataset.action === "editar") {
    preencherOrcamentoParaEdicao(orcamento);
    return;
  }

  if (btn.dataset.action === "excluir") {
    const ok = confirm("Deseja excluir este orcamento?");
    if (!ok) return;

    state.orcamentos = state.orcamentos.filter((item) => item.id !== id);
    salvarOrcamentosUsuario(state.usuario.id, state.orcamentos);
    if (state.orcamentoEditandoId === id) limparFormularioOrcamento();
    renderOrcamentos();
    toast("Orcamento excluido");
  }
}

function calcularResumoFinanceiroMes(mes) {
  const mesAnterior = obterMesAnterior(mes);
  const movMes = state.movimentacoes.filter((item) => item.data.slice(0, 7) === mes);
  const movMesAnterior = state.movimentacoes.filter((item) => item.data.slice(0, 7) === mesAnterior);

  const receitasMes = movMes.filter((item) => item.tipo === "receita");
  const despesasMes = movMes.filter((item) => item.tipo === "despesa");
  const totalReceitas = receitasMes.reduce((acc, item) => acc + Number(item.valor), 0);
  const totalDespesas = despesasMes.reduce((acc, item) => acc + Number(item.valor), 0);
  const saldoMes = totalReceitas - totalDespesas;

  const categoriaGastos = new Map();
  despesasMes.forEach((item) => {
    categoriaGastos.set(item.categoria, (categoriaGastos.get(item.categoria) || 0) + Number(item.valor));
  });

  const maiorCategoria = [...categoriaGastos.entries()].sort((a, b) => b[1] - a[1])[0] || ["-", 0];
  const despesasOrdenadas = [...despesasMes].sort((a, b) => Number(b.valor) - Number(a.valor));
  const menorDespesa = despesasOrdenadas.length
    ? Number(despesasOrdenadas[despesasOrdenadas.length - 1].valor)
    : 0;
  const maiorDespesa = despesasOrdenadas.length ? Number(despesasOrdenadas[0].valor) : 0;

  const [ano, numeroMes] = mes.split("-").map(Number);
  const diasNoMes = new Date(ano, numeroMes, 0).getDate();
  const mediaDiariaGastos = diasNoMes ? totalDespesas / diasNoMes : 0;

  const totalAno = state.movimentacoes
    .filter((item) => item.data.startsWith(`${ano}-`))
    .reduce((acc, item) => (item.tipo === "receita" ? acc + Number(item.valor) : acc - Number(item.valor)), 0);

  const resumoAnterior = calcularResumo(movMesAnterior);
  const saldoAnterior = resumoAnterior.receitas - resumoAnterior.despesas;

  return {
    mes,
    mesAnterior,
    movMes,
    receitasMes,
    despesasMes,
    totalReceitas,
    totalDespesas,
    saldoMes,
    qtdReceitas: receitasMes.length,
    qtdDespesas: despesasMes.length,
    maiorCategoria: maiorCategoria[0],
    valorMaiorCategoria: maiorCategoria[1],
    mediaDiariaGastos,
    maiorDespesa,
    menorDespesa,
    top5: despesasOrdenadas.slice(0, 5),
    comparativo: {
      totalReceitasAnterior: resumoAnterior.receitas,
      totalDespesasAnterior: resumoAnterior.despesas,
      saldoAnterior,
      variacaoSaldo: saldoMes - saldoAnterior,
    },
    totalEconomizadoAno: totalAno,
    categoriaGastos,
  };
}

function montarCardResumo(titulo, valor) {
  return `<article class="stat"><p>${titulo}</p><strong>${valor}</strong></article>`;
}

function renderResumoCards(resumo) {
  const variacaoLabel = `${formatarMoeda(resumo.comparativo.variacaoSaldo)} vs ${formatarMesReferencia(
    resumo.mesAnterior
  )}`;

  els.resumoCards.innerHTML = [
    montarCardResumo("Receita do mes", formatarMoeda(resumo.totalReceitas)),
    montarCardResumo("Despesas do mes", formatarMoeda(resumo.totalDespesas)),
    montarCardResumo("Saldo do mes", formatarMoeda(resumo.saldoMes)),
    montarCardResumo("Quantidade de receitas", String(resumo.qtdReceitas)),
    montarCardResumo("Quantidade de despesas", String(resumo.qtdDespesas)),
    montarCardResumo("Categoria com maior gasto", resumo.maiorCategoria),
    montarCardResumo("Valor da maior categoria", formatarMoeda(resumo.valorMaiorCategoria)),
    montarCardResumo("Media diaria de gastos", formatarMoeda(resumo.mediaDiariaGastos)),
    montarCardResumo("Maior despesa", formatarMoeda(resumo.maiorDespesa)),
    montarCardResumo("Menor despesa", formatarMoeda(resumo.menorDespesa)),
    montarCardResumo("Comparativo com mes anterior", variacaoLabel),
    montarCardResumo("Total economizado no ano", formatarMoeda(resumo.totalEconomizadoAno)),
  ].join("");
}

function renderResumoTop5(resumo) {
  if (!resumo.top5.length) {
    els.resumoTop5.innerHTML = '<li class="muted">Sem despesas no mes selecionado.</li>';
    return;
  }

  els.resumoTop5.innerHTML = resumo.top5
    .map((item) => `<li>${item.descricao} (${item.categoria}) - <strong>${formatarMoeda(item.valor)}</strong></li>`)
    .join("");
}

function destruirChartResumo(chave) {
  const chart = state.resumoCharts[chave];
  if (chart) {
    chart.destroy();
    state.resumoCharts[chave] = null;
  }
}

function renderResumoGraficos(resumo) {
  if (typeof Chart === "undefined") return;

  destruirChartResumo("pizza");
  destruirChartResumo("barras");
  destruirChartResumo("evolucao");

  const pizzaLabels = [...resumo.categoriaGastos.keys()];
  const pizzaValores = [...resumo.categoriaGastos.values()];

  state.resumoCharts.pizza = new Chart(els.resumoPizzaChart, {
    type: "pie",
    data: {
      labels: pizzaLabels.length ? pizzaLabels : ["Sem despesas"],
      datasets: [
        {
          data: pizzaValores.length ? pizzaValores : [1],
          backgroundColor: ["#0ea5e9", "#22c55e", "#f59e0b", "#ef4444", "#a78bfa", "#14b8a6", "#f97316"],
          borderColor: "#081128",
          borderWidth: 1,
        },
      ],
    },
    options: {
      plugins: {
        legend: { labels: { color: "#e2e8f0" } },
      },
    },
  });

  state.resumoCharts.barras = new Chart(els.resumoBarrasChart, {
    type: "bar",
    data: {
      labels: ["Receitas", "Despesas"],
      datasets: [
        {
          label: formatarMesReferencia(resumo.mes),
          data: [resumo.totalReceitas, resumo.totalDespesas],
          backgroundColor: ["#22c55e", "#ef4444"],
        },
        {
          label: formatarMesReferencia(resumo.mesAnterior),
          data: [resumo.comparativo.totalReceitasAnterior, resumo.comparativo.totalDespesasAnterior],
          backgroundColor: ["#16a34a", "#b91c1c"],
        },
      ],
    },
    options: {
      plugins: {
        legend: { labels: { color: "#e2e8f0" } },
      },
      scales: {
        x: { ticks: { color: "#94a3b8" }, grid: { color: "rgba(148,163,184,0.15)" } },
        y: {
          ticks: { color: "#94a3b8", callback: (value) => formatarMoeda(value) },
          grid: { color: "rgba(148,163,184,0.15)" },
          beginAtZero: true,
        },
      },
    },
  });

  const serie12 = agruparPorMes().slice(-12);
  state.resumoCharts.evolucao = new Chart(els.resumoEvolucaoChart, {
    type: "line",
    data: {
      labels: serie12.map((item) => formatarMesLabel(item.mes, true)),
      datasets: [
        {
          label: "Saldo mensal",
          data: serie12.map((item) => item.saldo),
          borderColor: "#38bdf8",
          backgroundColor: "rgba(56, 189, 248, 0.22)",
          fill: true,
          tension: 0.3,
          pointRadius: 2,
        },
      ],
    },
    options: {
      plugins: {
        legend: { labels: { color: "#e2e8f0" } },
      },
      scales: {
        x: { ticks: { color: "#94a3b8" }, grid: { color: "rgba(148,163,184,0.15)" } },
        y: {
          ticks: { color: "#94a3b8", callback: (value) => formatarMoeda(value) },
          grid: { color: "rgba(148,163,184,0.15)" },
        },
      },
    },
  });
}

function renderResumoFinanceiro() {
  const mes = els.resumoMes.value || mesAtualISO();
  const resumo = calcularResumoFinanceiroMes(mes);
  renderResumoCards(resumo);
  renderResumoTop5(resumo);
  renderResumoGraficos(resumo);
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

function formatarMesLabel(mesISO, incluirAno = false) {
  if (!/^\d{4}-\d{2}$/.test(mesISO || "")) return mesISO || "-";

  const [ano, mes] = mesISO.split("-").map(Number);
  const nomeMes = new Date(ano, mes - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
  });
  const mesCapitalizado = nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1);

  return incluirAno ? `${mesCapitalizado}/${ano}` : mesCapitalizado;
}

function calcularMediaMovel(valores, janela = 3) {
  return valores.map((_, indice) => {
    const inicio = Math.max(0, indice - janela + 1);
    const fatia = valores.slice(inicio, indice + 1);
    if (fatia.length < janela) return null;

    const soma = fatia.reduce((acc, valor) => acc + Number(valor || 0), 0);
    return soma / janela;
  });
}

function montarSerieMeta(serie) {
  const metasPorMes = new Map(state.metas.map((meta) => [meta.mes, Number(meta.valor_meta)]));
  return serie.map((item) => metasPorMes.get(item.mes) ?? null);
}

function atualizarInsightGrafico(serie, saldoData, mediaMovelData, metaData) {
  if (!els.chartInsight) return;

  if (!serie.length) {
    els.chartInsight.textContent = "Adicione movimentacoes em mais de um mes para ver a evolucao.";
    return;
  }

  const ultimoIndice = saldoData.length - 1;
  const saldoAtual = Number(saldoData[ultimoIndice] || 0);
  const saldoAnterior = ultimoIndice > 0 ? Number(saldoData[ultimoIndice - 1] || 0) : null;
  const mediaAtual = mediaMovelData[ultimoIndice];
  const mesesAcimaMeta = saldoData.reduce((acc, saldo, index) => {
    const meta = metaData[index];
    return acc + (meta != null && saldo > meta ? 1 : 0);
  }, 0);

  const partes = [];

  if (saldoAnterior != null) {
    if (saldoAtual > saldoAnterior) {
      partes.push("Tendencia de alta no ultimo mes.");
    } else if (saldoAtual < saldoAnterior) {
      partes.push("Tendencia de queda no ultimo mes.");
    } else {
      partes.push("Saldo estavel no ultimo mes.");
    }
  }

  if (mediaAtual != null) {
    if (saldoAtual > mediaAtual) {
      partes.push("O saldo atual esta acima da media movel.");
    } else if (saldoAtual < mediaAtual) {
      partes.push("O saldo atual esta abaixo da media movel.");
    }
  }

  if (mesesAcimaMeta > 0) {
    partes.push(`${mesesAcimaMeta} mes(es) acima da meta.`);
  } else if (metaData.some((meta) => meta != null)) {
    partes.push("Nenhum mes ultrapassou a meta registrada.");
  }

  els.chartInsight.textContent = partes.join(" ") || "Insira mais meses para acompanhar a tendencia.";
}

function renderChart() {
  const serie = agruparPorMes();

  if (state.chart) {
    state.chart.destroy();
    state.chart = null;
  }

  const canvas = document.getElementById("evolucaoChart");
  if (!canvas || typeof Chart === "undefined") return;

  if (!serie.length) return;

  const labels = serie.map((item, index) => {
    const anoAnterior = index > 0 ? serie[index - 1].mes.slice(0, 4) : null;
    const anoAtual = item.mes.slice(0, 4);
    return formatarMesLabel(item.mes, index === 0 || anoAtual !== anoAnterior);
  });

  const saldoData = serie.map((i) => i.saldo);
  const mediaMovelData = calcularMediaMovel(saldoData, 3);
  const metaData = montarSerieMeta(serie);
  const coresBarras = saldoData.map((saldo, index) => {
    if (metaData[index] != null && saldo > metaData[index]) return "#ef4444";
    if (index === 0) return "#0b1b52";
    const saldoAnterior = saldoData[index - 1];
    if (saldo > saldoAnterior) return "#0b1b52";
    if (saldo < saldoAnterior) return "#9b1c31";
    return "#334155";
  });

  state.chart = new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Saldo mensal",
          data: saldoData,
          backgroundColor: coresBarras,
          borderColor: "#0a1338",
          borderWidth: 1,
          borderRadius: 2,
          maxBarThickness: 50,
          order: 2,
        },
        {
          label: "Média móvel 3 meses",
          data: mediaMovelData,
          type: "line",
          borderColor: "#f59e0b",
          backgroundColor: "rgba(245, 158, 11, 0.18)",
          borderWidth: 2,
          borderDash: [6, 4],
          tension: 0.32,
          pointRadius: 2,
          pointHoverRadius: 4,
          pointBackgroundColor: "#f59e0b",
          spanGaps: true,
          fill: false,
          order: 1,
        },
        {
          label: "Meta mensal",
          data: metaData,
          type: "line",
          borderColor: "#ef4444",
          backgroundColor: "rgba(239, 68, 68, 0.12)",
          borderWidth: 2,
          borderDash: [4, 4],
          tension: 0,
          pointRadius: 0,
          spanGaps: true,
          fill: false,
          order: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          labels: {
            color: "#e2e8f0",
            boxWidth: 12,
            boxHeight: 12,
            usePointStyle: true,
            pointStyle: "rectRounded",
            font: { size: 11 },
          },
        },
        title: {
          display: true,
          text: "Evolucao de saldo nos meses",
          color: "#e2e8f0",
          font: { size: 15, weight: "bold" },
          padding: { bottom: 12 },
        },
        tooltip: {
          callbacks: {
            title: (items) => `Mes: ${items[0].label}`,
            label: (context) => {
              const valorAtual = Number(context.raw || 0);
              const idx = context.dataIndex;
              if (context.dataset.label === "Meta mensal") {
                return `Meta: ${formatarMoeda(valorAtual)}`;
              }

              if (context.dataset.label === "Média móvel 3 meses") {
                return `Média móvel: ${formatarMoeda(valorAtual)}`;
              }

              if (idx === 0) {
                return `Saldo: ${formatarMoeda(valorAtual)}`;
              }

              if (metaData[idx] != null && valorAtual > metaData[idx]) {
                return `Acima da meta: ${formatarMoeda(valorAtual - metaData[idx])} | Saldo: ${formatarMoeda(
                  valorAtual
                )}`;
              }

              const valorAnterior = Number(saldoData[idx - 1]);
              const variacao = valorAtual - valorAnterior;
              const direcao = variacao > 0 ? "Alta" : variacao < 0 ? "Queda" : "Sem variacao";
              return `${direcao}: ${formatarMoeda(Math.abs(variacao))} | Saldo: ${formatarMoeda(
                valorAtual
              )}`;
            },
          },
        },
      },
      scales: {
        x: {
          ticks: { color: "#94a3b8" },
          grid: { color: "rgba(148,163,184,0.15)" },
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: "#94a3b8",
            callback: (value) => formatarMoeda(value),
          },
          grid: { color: "rgba(148,163,184,0.15)" },
        },
      },
    },
  });

  atualizarInsightGrafico(serie, saldoData, mediaMovelData, metaData);
}

async function atualizarTudo() {
  state.movimentacoes = await listarMovimentacoesUsuario(state.usuario.id);
  state.metas = await listarMetasUsuario(state.usuario.id);
  state.orcamentos = carregarOrcamentosUsuario(state.usuario.id);
  atualizarFiltroCategorias();
  atualizarDatalistCategoriasOrcamento();
  renderDashboard();
  renderHistorico();
  renderOrcamentos();
  renderResumoFinanceiro();
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
    navigator.serviceWorker.register("./service-worker.js").then((registration) => {
      const aplicarAtualizacao = (worker) => {
        if (!worker) return;
        worker.postMessage({ type: "SKIP_WAITING" });
      };

      if (registration.waiting) {
        aplicarAtualizacao(registration.waiting);
      }

      registration.addEventListener("updatefound", () => {
        const novoWorker = registration.installing;
        if (!novoWorker) return;

        novoWorker.addEventListener("statechange", () => {
          if (novoWorker.state === "installed" && navigator.serviceWorker.controller) {
            toast("Nova versao encontrada. Atualizando app...");
            aplicarAtualizacao(novoWorker);
          }
        });
      });

      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (state.swRefreshing) return;
        state.swRefreshing = true;
        window.location.reload();
      });

      registration.update().catch(() => {});
      setInterval(() => registration.update().catch(() => {}), 60 * 1000);

      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
          registration.update().catch(() => {});
        }
      });
    }).catch(() => {
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
      if (btn.dataset.view === "orcamentos") {
        renderOrcamentos();
      }
      if (btn.dataset.view === "resumo") {
        renderResumoFinanceiro();
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

  els.orcamentoForm.addEventListener("submit", (event) => {
    tratarOrcamentoSubmit(event).catch(() => {
      toast("Nao foi possivel salvar o orcamento");
    });
  });

  els.cancelOrcamentoEditBtn.addEventListener("click", () => limparFormularioOrcamento());

  els.orcamentosLista.addEventListener("click", (event) => {
    tratarOrcamentosClick(event);
  });

  els.historicoLista.addEventListener("click", (event) => {
    tratarHistoricoClick(event).catch(() => toast("Erro ao processar acao"));
  });

  [els.filtroTipo, els.filtroCategoria, els.filtroMes].forEach((input) => {
    input.addEventListener("input", () => renderHistorico());
    input.addEventListener("change", () => renderHistorico());
  });

  els.baixarPdfBtn.addEventListener("click", () => {
    baixarRelatorioMensalPdf().catch(() => {
      toast("Erro ao gerar o PDF do relatorio");
    });
  });
  els.enviarWhatsappBtn.addEventListener("click", () => {
    enviarRelatorioWhatsapp().catch(() => {
      toast("Erro ao enviar relatorio para o WhatsApp");
    });
  });

  els.filtroMes.value = mesAtualISO();
  els.orcamentoMes.value = mesAtualISO();
  els.resumoMes.value = mesAtualISO();

  els.resumoMes.addEventListener("input", () => renderResumoFinanceiro());
  els.resumoMes.addEventListener("change", () => renderResumoFinanceiro());

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
    state.metas = await listarMetasUsuario(state.usuario.id);
    await renderMeta();
    renderChart();
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
