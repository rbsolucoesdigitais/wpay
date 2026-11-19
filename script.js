
// URL DO APP DA WEB
// https://script.google.com/macros/s/AKfycbxftMwBS4FAmngTITeA6mVjBfvDrnLBOprHYHnVtlOgxrMtgnDN9mYq6tlOVcIoaUhEYA/exec






document.addEventListener("DOMContentLoaded", () => {

    // ==========================================
    // CONFIGURAÇÃO DA API
    // ==========================================
    const URL_APPS_SCRIPT = "https://script.google.com/macros/s/AKfycbxftMwBS4FAmngTITeA6mVjBfvDrnLBOprHYHnVtlOgxrMtgnDN9mYq6tlOVcIoaUhEYA/exec";

    // ==========================================
    // PWA: SERVICE WORKER E SOLICITAÇÃO DE INSTALAÇÃO
    // ==========================================
    const btnInstalarApp = document.getElementById("btnInstalarApp");
    let eventoInstalacaoPendente = null;
    let jaSolicitouNestaSessao = false;

    const appJaInstalado =
        window.matchMedia("(display-mode: standalone)").matches ||
        window.navigator.standalone === true;

    if ("serviceWorker" in navigator) {
        window.addEventListener("load", () => {
            navigator.serviceWorker.register("./sw.js").catch((err) => {
                console.error("Falha ao registrar Service Worker:", err);
            });
        });
    }

    async function solicitarInstalacaoPWA() {
        if (!eventoInstalacaoPendente || typeof Swal === "undefined") return;

        const promptEvento = eventoInstalacaoPendente;
        const resposta = await Swal.fire({
            title: "Instale o WPay",
            text: "Adicione o WPay à sua tela inicial e acesse de forma fácil.",
            icon: "info",
            showCancelButton: true,
            confirmButtonColor: "#4263eb",
            cancelButtonColor: "#64748b",
            confirmButtonText: "Instalar agora",
            cancelButtonText: "Depois"
        });

        if (resposta.isConfirmed) {
            eventoInstalacaoPendente = null;
            if (btnInstalarApp) btnInstalarApp.style.display = "none";
            await promptEvento.prompt();
            await promptEvento.userChoice;
        }
    }

    window.addEventListener("beforeinstallprompt", (event) => {
        if (appJaInstalado) return;
        event.preventDefault();
        eventoInstalacaoPendente = event;

        if (btnInstalarApp) {
            btnInstalarApp.style.display = "inline-flex";
        }

        if (!jaSolicitouNestaSessao && !loadingAtivo && (!authModal || !authModal.classList.contains("show"))) {
            jaSolicitouNestaSessao = true;
            solicitarInstalacaoPWA();
        }
    });

    window.addEventListener("appinstalled", () => {
        eventoInstalacaoPendente = null;
        if (btnInstalarApp) btnInstalarApp.style.display = "none";
        if (typeof Swal !== "undefined") {
            Swal.fire({
                icon: "success",
                title: "App instalado!",
                text: "Controle Financeiro adicionado à sua tela inicial.",
                timer: 1800,
                showConfirmButton: false
            });
        }
    });

    if (btnInstalarApp) {
        btnInstalarApp.addEventListener("click", solicitarInstalacaoPWA);
    }

    // ==========================================
    // INICIALIZAÇÃO DOS ELEMENTOS
    // ==========================================
    const navItems = document.querySelectorAll(".nav-item");
    const contents = document.querySelectorAll(".tab-content");

    // Elementos da Dash
    const qtdPendentesEl = document.getElementById("qtdPendentes");
    const qtdPagasEl = document.getElementById("qtdPagas");
    const debitoTotalEl = document.getElementById("debitoTotal");
    const valorPagoTotalEl = document.getElementById("valorPagoTotal");
    const saldoDevedorEl = document.getElementById("saldoDevedor");
    const labelMesAtualEl = document.getElementById("labelMesAtual");
    const percentualQuitadoCentroEl = document.getElementById("percentualQuitadoCentro");
    const canvasGrafico = document.getElementById("graficoStatus");
    let instanciaGrafico = null;

    // Lista, Busca, Filtros e Estado Vazio
    const accountsList = document.getElementById("accountsList");
    const emptyState = document.getElementById("emptyState");
    const searchInput = document.getElementById("searchInput");
    const filterButtons = document.querySelectorAll(".filter-btn");

    // Modal de Nova Conta / Edição
    const modal = document.getElementById("modal");
    const modalTitle = document.getElementById("modalTitle");
    const openModal = document.getElementById("openModal");
    const closeModal = document.getElementById("closeModal");
    const cancelModal = document.getElementById("cancelModal");
    const accountForm = document.getElementById("accountForm");
    const campoConta = document.getElementById("conta");
    const campoVencimento = document.getElementById("vencimento");
    const campoValor = document.getElementById("valor");
    const campoDescricao = document.getElementById("descricao");

    // Modal de Autenticação (Senha)
    const authModal = document.getElementById("authModal");
    const authForm = document.getElementById("authForm");
    const senhaInput = document.getElementById("senhaInput");
    const authError = document.getElementById("authError");

    let idEmEdicao = null;
    let contasEmMemoria = [];
    let filtroAtual = "Todos";
    let termoBusca = "";
    let loadingAtivo = false;

    // ==========================================
    // CONTROLE CENTRALIZADO DE LOADING
    // ==========================================
    function mostrarLoading(titulo = "Carregando...", texto = "Estamos carregamos as informações") {
        if (typeof Swal === "undefined") return;
        loadingAtivo = true;

        if (Swal.isVisible()) {
            Swal.update({
                title: titulo,
                text: texto,
                allowOutsideClick: false,
                showConfirmButton: false
            });
            Swal.showLoading();
            return;
        }

        Swal.fire({
            title: titulo,
            text: texto,
            allowOutsideClick: false,
            allowEscapeKey: false,
            showConfirmButton: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });
    }

    function esconderLoading() {
        loadingAtivo = false;
        if (typeof Swal !== "undefined" && Swal.isVisible()) {
            Swal.close();
        }
        if (eventoInstalacaoPendente && !jaSolicitouNestaSessao && (!authModal || !authModal.classList.contains("show"))) {
            jaSolicitouNestaSessao = true;
            solicitarInstalacaoPWA();
        }
    }

    // ==========================================
    // INICIALIZAÇÃO DOS ÍCONES
    // ==========================================
    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }

    // ==========================================
    // FORMATADORES, BUSCA APROXIMADA E VENCIMENTO
    // ==========================================
    function formatarMoeda(valor) {
        return Number(valor).toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL"
        });
    }

    function formatarData(dataStr) {
        if (!dataStr) return "";
        const dataPura = String(dataStr).split("T")[0];
        const partes = dataPura.split("-");
        if (partes.length === 3) {
            return `${partes[2]}/${partes[1]}/${partes[0]}`;
        }
        return dataStr;
    }

    function formatarDataParaInput(dataStr) {
        if (!dataStr) return "";
        return String(dataStr).split("T")[0];
    }

    function normalizarTexto(texto) {
        return String(texto || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .trim();
    }

    function distanciaLevenshtein(a, b) {
        const m = a.length;
        const n = b.length;
        if (m === 0) return n;
        if (n === 0) return m;

        const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
        for (let i = 0; i <= m; i++) dp[i][0] = i;
        for (let j = 0; j <= n; j++) dp[0][j] = j;

        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                const custo = a[i - 1] === b[j - 1] ? 0 : 1;
                dp[i][j] = Math.min(
                    dp[i - 1][j] + 1,
                    dp[i][j - 1] + 1,
                    dp[i - 1][j - 1] + custo
                );
            }
        }
        return dp[m][n];
    }

    function termoAproximaPalavra(termo, palavra) {
        if (!termo) return true;
        if (!palavra) return false;
        if (palavra.includes(termo) || termo.includes(palavra)) return true;

        const maxDist = termo.length <= 3 ? 0 : termo.length <= 6 ? 1 : 2;
        if (maxDist === 0) return false;

        if (Math.abs(palavra.length - termo.length) <= maxDist) {
            if (distanciaLevenshtein(termo, palavra) <= maxDist) return true;
        }

        if (palavra.length > termo.length) {
            const inicio = Math.max(0, termo.length - maxDist);
            const fim = Math.min(palavra.length, termo.length + maxDist);
            for (let tam = inicio; tam <= fim; tam++) {
                for (let idx = 0; idx <= palavra.length - tam; idx++) {
                    const janela = palavra.slice(idx, idx + tam);
                    if (distanciaLevenshtein(termo, janela) <= maxDist) {
                        return true;
                    }
                }
            }
        }

        return false;
    }

    function correspondeBuscaAproximada(item, buscaBruta) {
        const buscaLimpa = normalizarTexto(buscaBruta);
        if (!buscaLimpa) return true;

        const textoAlvo = normalizarTexto(`${item.conta || ""} ${item.descricao || ""}`);
        if (textoAlvo.includes(buscaLimpa)) return true;

        const termosBusca = buscaLimpa.split(/\s+/).filter(Boolean);
        const palavrasAlvo = textoAlvo.split(/[^a-z0-9]+/).filter(Boolean);

        return termosBusca.every(termo =>
            palavrasAlvo.some(palavra => termoAproximaPalavra(termo, palavra))
        );
    }

    function obterAlertaVencimento(dataStr, isPago) {
        if (isPago || !dataStr) return null;

        const dataPura = String(dataStr).split("T")[0];
        const partes = dataPura.split("-");
        if (partes.length !== 3) return null;

        const agora = new Date();
        const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
        const vencimento = new Date(Number(partes[0]), Number(partes[1]) - 1, Number(partes[2]));

        const diffDias = Math.round((vencimento - hoje) / (1000 * 60 * 60 * 24));

        if (diffDias <= 0) {
            return {
                cardClass: "vencida-ou-hoje",
                badgeClass: "vermelho",
                texto: diffDias < 0 ? `Vencida há ${Math.abs(diffDias)}d` : "Vence hoje"
            };
        }
        if (diffDias === 1) {
            return {
                cardClass: "vence-amanha",
                badgeClass: "laranja",
                texto: "Vence amanhã"
            };
        }
        if (diffDias === 2) {
            return {
                cardClass: "vence-2-dias",
                badgeClass: "amarelo",
                texto: "Vence em 2 dias"
            };
        }
        return null;
    }

    // ==========================================
    // ATUALIZAR DASH (INDICADORES + DOUGHNUT)
    // ==========================================
    function atualizarDash(contas) {
        const agora = new Date();
        if (labelMesAtualEl) {
            labelMesAtualEl.textContent = agora.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
        }

        const pendentes = contas.filter(c => c.status !== "Pago");
        const pagas = contas.filter(c => c.status === "Pago");

        const saldoDevedor = pendentes.reduce((acc, item) => acc + (Number(item.valor) || 0), 0);
        const valorPago = pagas.reduce((acc, item) => acc + (Number(item.valor) || 0), 0);
        const debitoTotal = valorPago + saldoDevedor;

        const percQuitado = debitoTotal > 0 ? ((valorPago / debitoTotal) * 100).toFixed(1) : "0.0";

        if (qtdPendentesEl) qtdPendentesEl.textContent = pendentes.length;
        if (qtdPagasEl) qtdPagasEl.textContent = pagas.length;
        if (debitoTotalEl) debitoTotalEl.textContent = formatarMoeda(debitoTotal);
        if (valorPagoTotalEl) valorPagoTotalEl.textContent = formatarMoeda(valorPago);
        if (saldoDevedorEl) saldoDevedorEl.textContent = formatarMoeda(saldoDevedor);

        if (percentualQuitadoCentroEl) {
            percentualQuitadoCentroEl.innerHTML = `
                <div style="font-size: 1.35rem; font-weight: 800; color: #10b981;">${percQuitado}%</div>
                <div style="font-size: 0.7rem; font-weight: 700; color: #64748b;">QUITADO</div>
            `;
        }

        if (!canvasGrafico || typeof Chart === "undefined") return;

        if (instanciaGrafico) {
            instanciaGrafico.destroy();
        }

        const temDados = debitoTotal > 0;

        instanciaGrafico = new Chart(canvasGrafico.getContext("2d"), {
            type: "doughnut",
            data: {
                labels: temDados ? ["Quitado", "Saldo devedor"] : ["Sem contas"],
                datasets: [{
                    data: temDados ? [valorPago, saldoDevedor] : [1],
                    backgroundColor: temDados ? ["#10b981", "#fa8072"] : ["#e2e8f0"],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: "72%",
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                if (!temDados) return " Nenhuma conta cadastrada";
                                const perc = ((ctx.parsed / debitoTotal) * 100).toFixed(1);
                                return ` ${ctx.label}: ${perc}% (${formatarMoeda(ctx.parsed)})`;
                            }
                        }
                    }
                }
            }
        });
    }

    // ==========================================
    // FILTROS RÁPIDOS + BUSCA APROXIMADA
    // ==========================================
    function atualizarEstiloBotoesFiltro() {
        filterButtons.forEach(btn => {
            const ativo = btn.dataset.filter === filtroAtual;
            btn.classList.toggle("active", ativo);
        });
    }

    function aplicarFiltroERenderizar() {
        atualizarEstiloBotoesFiltro();

        const filtradas = contasEmMemoria.filter(item => {
            const statusItem = item.status === "Pago" ? "Pago" : "Pendente";
            const passaStatus = filtroAtual === "Todos" || statusItem === filtroAtual;
            const passaBusca = correspondeBuscaAproximada(item, termoBusca);

            return passaStatus && passaBusca;
        });

        renderizarLista(filtradas);
    }

    filterButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            filtroAtual = btn.dataset.filter;
            aplicarFiltroERenderizar();
        });
    });

    if (searchInput) {
        searchInput.addEventListener("input", (event) => {
            termoBusca = event.target.value;
            aplicarFiltroERenderizar();
        });
    }

    // ==========================================
    // CARREGAR E RENDERIZAR CONTAS
    // ==========================================
    async function carregarContas({ gerenciarLoading = true } = {}) {
        const senhaSalva = localStorage.getItem("controle_financeiro_senha");
        if (!senhaSalva) return;

        if (gerenciarLoading) {
            mostrarLoading("Carregando dados...", "Por favor, aguarde");
        }

        try {
            const resposta = await fetch(URL_APPS_SCRIPT, {
                method: "POST",
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify({ acao: "listar", senha: senhaSalva })
            });

            const resultado = await resposta.json();

            if (resultado.status === "sucesso") {
                contasEmMemoria = Array.isArray(resultado.dados) ? resultado.dados : [];
                aplicarFiltroERenderizar();
                atualizarDash(contasEmMemoria);
            } else {
                contasEmMemoria = [];
                aplicarFiltroERenderizar();
                atualizarDash([]);
            }
        } catch (erro) {
            console.error("Erro ao carregar contas:", erro);
            if (accountsList) {
                accountsList.innerHTML = `<p style="text-align: center; color: #e11d48; padding: 20px;">Erro de conexão ao carregar os dados.</p>`;
            }
        } finally {
            if (gerenciarLoading) {
                esconderLoading();
            }
        }
    }

    function renderizarLista(contas) {
        if (!accountsList) return;
        accountsList.innerHTML = "";

        if (!contas || contas.length === 0) {
            if (emptyState) emptyState.style.display = "flex";
            return;
        }

        if (emptyState) emptyState.style.display = "none";

        const ordenadas = [...contas].sort((a, b) => {
            const pesoA = a.status === "Pago" ? 1 : 0;
            const pesoB = b.status === "Pago" ? 1 : 0;
            if (pesoA !== pesoB) return pesoA - pesoB;
            return new Date(a.vencimento) - new Date(b.vencimento);
        });

        ordenadas.forEach(item => {
            const isPago = item.status === "Pago";
            const alerta = obterAlertaVencimento(item.vencimento, isPago);
            const card = document.createElement("div");

            card.className = [
                "conta-card",
                isPago ? "is-pago" : "",
                alerta ? alerta.cardClass : ""
            ].filter(Boolean).join(" ");

            card.innerHTML = `
                <div style="flex: 1; min-width: 0;">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px; flex-wrap: wrap;">
                        <strong class="conta-titulo" style="font-size: 1rem; color: #0f172a;">
                            ${item.conta}
                        </strong>
                        <span style="font-size: 0.7rem; font-weight: 600; background: #f1f5f9; color: #475569; padding: 2px 8px; border-radius: 999px;">
                            ${item.usuario}
                        </span>
                        <span style="font-size: 0.7rem; font-weight: 700; background: ${isPago ? "#dcfce7" : "#ffe8e5"}; color: ${isPago ? "#15803d" : "#c85a4b"}; padding: 2px 8px; border-radius: 999px;">
                            ${isPago ? "Pago" : "Pendente"}
                        </span>
                        ${alerta ? `<span class="vencimento-badge ${alerta.badgeClass}">${alerta.texto}</span>` : ""}
                    </div>
                    <div style="font-size: 0.85rem; color: #64748b;">
                        Vence em <strong>${formatarData(item.vencimento)}</strong>
                        ${item.descricao ? ` • ${item.descricao}` : ""}
                    </div>
                </div>

                <div style="display: flex; align-items: center; gap: 10px;">
                    <div style="font-weight: 700; font-size: 1.05rem; color: #0f172a; white-space: nowrap;">
                        ${formatarMoeda(item.valor)}
                    </div>

                    <button type="button" class="btn-toggle-status" title="${isPago ? "Reabrir conta" : "Quitar conta"}" style="background: ${isPago ? "#10b981" : "#e2e8f0"}; border: none; color: ${isPago ? "#ffffff" : "#334155"}; padding: 6px 10px; border-radius: 999px; font-size: 0.75rem; font-weight: 700; cursor: pointer; white-space: nowrap;">
                        ${isPago ? "Pago ✓" : "Quitar"}
                    </button>

                    <div style="display: flex; gap: 4px;">
                        <button type="button" class="btn-editar" title="Editar conta" style="background: #f1f5f9; border: none; color: #475569; width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
                            <i data-lucide="pencil" style="width: 15px; height: 15px;"></i>
                        </button>
                        <button type="button" class="btn-excluir" title="Excluir conta" style="background: #fff1f2; border: none; color: #e11d48; width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
                            <i data-lucide="trash-2" style="width: 15px; height: 15px;"></i>
                        </button>
                    </div>
                </div>
            `;

            card.querySelector(".btn-toggle-status").addEventListener("click", () => alternarStatus(item));
            card.querySelector(".btn-editar").addEventListener("click", () => abrirModalEdicao(item));
            card.querySelector(".btn-excluir").addEventListener("click", () => confirmarExclusao(item));

            accountsList.appendChild(card);
        });

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }
    }

    // ==========================================
    // ALTERNAR STATUS (PAGO / PENDENTE)
    // ==========================================
    async function alternarStatus(item) {
        if (loadingAtivo) return;

        const senhaAtual = localStorage.getItem("controle_financeiro_senha");
        if (!senhaAtual) {
            abrirModalSenha("Sessão expirada. Digite sua senha novamente.");
            return;
        }

        const novoStatus = item.status === "Pago" ? "Pendente" : "Pago";
        mostrarLoading(
            novoStatus === "Pago" ? "Quitando conta..." : "Reabrindo conta...",
            "Atualizando status"
        );

        try {
            const resposta = await fetch(URL_APPS_SCRIPT, {
                method: "POST",
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify({
                    acao: "alternar_status",
                    senha: senhaAtual,
                    id: item.id,
                    status: novoStatus
                })
            });

            const resultado = await resposta.json();

            if (resultado.status === "sucesso") {
                await carregarContas({ gerenciarLoading: false });
                esconderLoading();
            } else {
                esconderLoading();
                Swal.fire({ icon: "error", title: "Erro", text: resultado.mensagem });
            }
        } catch (erro) {
            esconderLoading();
            console.error("Erro ao alterar status:", erro);
            Swal.fire({ icon: "error", title: "Erro de Conexão", text: "Não foi possível atualizar o status." });
        }
    }

    // ==========================================
    // EXCLUIR CONTA
    // ==========================================
    async function confirmarExclusao(item) {
        if (loadingAtivo) return;

        const confirmacao = await Swal.fire({
            title: "Excluir conta?",
            text: `Deseja realmente apagar "${item.conta}" (${formatarMoeda(item.valor)})?`,
            icon: "warning",
            showCancelButton: true,
            confirmButtonColor: "#e11d48",
            cancelButtonColor: "#64748b",
            confirmButtonText: "Sim, excluir",
            cancelButtonText: "Cancelar"
        });

        if (!confirmacao.isConfirmed) return;

        const senhaAtual = localStorage.getItem("controle_financeiro_senha");
        if (!senhaAtual) {
            abrirModalSenha("Sessão expirada. Digite sua senha novamente.");
            return;
        }

        mostrarLoading("Excluindo...", "Removendo registro e atualizando dados");

        try {
            const resposta = await fetch(URL_APPS_SCRIPT, {
                method: "POST",
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify({
                    acao: "excluir",
                    senha: senhaAtual,
                    id: item.id
                })
            });

            const resultado = await resposta.json();

            if (resultado.status === "sucesso") {
                await carregarContas({ gerenciarLoading: false });
                esconderLoading();
                Swal.fire({
                    icon: "success",
                    title: "Excluída!",
                    text: "A conta foi removida com sucesso.",
                    timer: 1800,
                    showConfirmButton: false
                });
            } else {
                esconderLoading();
                Swal.fire({ icon: "error", title: "Erro", text: resultado.mensagem });
            }
        } catch (erro) {
            esconderLoading();
            console.error("Erro ao excluir:", erro);
            Swal.fire({ icon: "error", title: "Erro de Conexão", text: "Não foi possível excluir a conta." });
        }
    }

    // ==========================================
    // CONTROLE DE ACESSO E VALIDAÇÃO DE SENHA
    // ==========================================
    function abrirModalSenha(mensagemErro = "") {
        esconderLoading();
        if (!authModal) return;

        if (mensagemErro && authError) {
            authError.textContent = mensagemErro;
            authError.style.display = "block";
        } else if (authError) {
            authError.style.display = "none";
        }

        authModal.classList.add("show");
        setTimeout(() => {
            if (senhaInput) senhaInput.focus();
        }, 100);
    }

    function fecharModalSenha() {
        if (!authModal) return;
        authModal.classList.remove("show");
        if (authForm) authForm.reset();
        if (authError) authError.style.display = "none";
    }

    async function validarSenhaNoServidor(senha) {
        try {
            const resposta = await fetch(URL_APPS_SCRIPT, {
                method: "POST",
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify({ acao: "validar_senha", senha: senha })
            });
            return await resposta.json();
        } catch (erro) {
            console.error("Erro na validação:", erro);
            return { status: "erro", mensagem: "Erro de conexão com o servidor." };
        }
    }

    async function checarSessaoInicial() {
        const senhaSalva = localStorage.getItem("controle_financeiro_senha");

        if (!senhaSalva) {
            abrirModalSenha();
            return;
        }

        mostrarLoading("Carregando...", "Por favor, aguarde.");

        const resultado = await validarSenhaNoServidor(senhaSalva);

        if (resultado.status === "sucesso") {
            await carregarContas({ gerenciarLoading: false });
            esconderLoading();
        } else {
            localStorage.removeItem("controle_financeiro_senha");
            abrirModalSenha("Sessão expirada ou senha inválida. Digite novamente.");
        }
    }

    checarSessaoInicial();

    if (authForm) {
        authForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            if (loadingAtivo) return;

            const senhaDigitada = senhaInput.value.trim();

            if (!senhaDigitada) {
                abrirModalSenha("Por favor, digite sua senha.");
                return;
            }

            mostrarLoading("Autenticando...", "Validando senha e carregando dados");

            const resultado = await validarSenhaNoServidor(senhaDigitada);

            if (resultado.status === "sucesso") {
                localStorage.setItem("controle_financeiro_senha", senhaDigitada);
                fecharModalSenha();
                await carregarContas({ gerenciarLoading: false });
                esconderLoading();

                Swal.fire({
                    icon: "success",
                    title: `Bem-vindo(a), ${resultado.usuario}!`,
                    showConfirmButton: false,
                    timer: 1500
                });
            } else {
                abrirModalSenha(resultado.mensagem);
            }
        });
    }

    // ==========================================
    // NAVEGAÇÃO ENTRE ABAS
    // ==========================================
    navItems.forEach(item => {
        item.addEventListener("click", () => {
            const tab = item.dataset.tab;
            const destino = document.getElementById(tab);

            if (!destino) return;

            navItems.forEach(nav => nav.classList.remove("active"));
            item.classList.add("active");

            contents.forEach(content => content.classList.remove("active"));
            destino.classList.add("active");

            if (tab === "dash" && typeof Chart !== "undefined") {
                atualizarDash(contasEmMemoria);
            }
        });
    });

    // ==========================================
    // MODAL DE NOVA CONTA E EDIÇÃO
    // ==========================================
    function abrirModal() {
        if (!localStorage.getItem("controle_financeiro_senha")) {
            abrirModalSenha("Você precisa se autenticar primeiro.");
            return;
        }
        idEmEdicao = null;
        if (modalTitle) modalTitle.textContent = "Adicionar conta";
        if (accountForm) accountForm.reset();
        if (!modal) return;
        modal.classList.add("show");
        setTimeout(() => {
            if (campoConta) campoConta.focus();
        }, 100);
    }

    function abrirModalEdicao(item) {
        if (!localStorage.getItem("controle_financeiro_senha")) {
            abrirModalSenha("Você precisa se autenticar primeiro.");
            return;
        }
        idEmEdicao = item.id;
        if (modalTitle) modalTitle.textContent = "Editar conta";

        campoConta.value = item.conta || "";
        campoVencimento.value = formatarDataParaInput(item.vencimento);
        campoValor.value = Number(item.valor) || "";
        campoDescricao.value = item.descricao || "";

        if (!modal) return;
        modal.classList.add("show");
        setTimeout(() => {
            if (campoConta) campoConta.focus();
        }, 100);
    }

    function fecharModal() {
        if (!modal) return;
        modal.classList.remove("show");
        idEmEdicao = null;
        if (modalTitle) modalTitle.textContent = "Adicionar conta";
        if (accountForm) accountForm.reset();
    }

    if (openModal) openModal.addEventListener("click", abrirModal);
    if (closeModal) closeModal.addEventListener("click", fecharModal);
    if (cancelModal) cancelModal.addEventListener("click", fecharModal);

    if (modal) {
        modal.addEventListener("click", (event) => {
            if (event.target === modal) fecharModal();
        });
    }

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && modal && modal.classList.contains("show")) {
            fecharModal();
        }
    });

    // ==========================================
    // SALVAR (CRIAR OU EDITAR) CONTA
    // ==========================================
    if (accountForm) {
        accountForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            if (loadingAtivo) return;

            const senhaAtual = localStorage.getItem("controle_financeiro_senha");
            if (!senhaAtual) {
                fecharModal();
                abrirModalSenha("Sessão expirada. Digite sua senha novamente.");
                return;
            }

            const conta = campoConta.value.trim();
            const vencimento = campoVencimento.value;
            const valor = Number(campoValor.value);
            const descricao = campoDescricao.value.trim();

            if (!conta || !vencimento || !Number.isFinite(valor) || valor <= 0) {
                return;
            }

            const editando = idEmEdicao !== null;

            const payload = editando
                ? {
                    acao: "editar",
                    senha: senhaAtual,
                    id: idEmEdicao,
                    conta,
                    vencimento,
                    valor,
                    descricao
                }
                : {
                    senha: senhaAtual,
                    id: Date.now(),
                    conta,
                    vencimento,
                    valor,
                    descricao,
                    criadoEm: new Date().toISOString()
                };

            mostrarLoading(
                editando ? "Atualizando conta..." : "Salvando conta...",
                "Atualizando os dados"
            );

            try {
                const resposta = await fetch(URL_APPS_SCRIPT, {
                    method: "POST",
                    headers: { "Content-Type": "text/plain;charset=utf-8" },
                    body: JSON.stringify(payload)
                });

                const resultado = await resposta.json();

                if (resultado.status === "sucesso") {
                    fecharModal();
                    await carregarContas({ gerenciarLoading: false });
                    esconderLoading();

                    Swal.fire({
                        icon: "success",
                        title: editando ? "Conta atualizada!" : "Conta salva!",
                        text: editando ? "As alterações foram salvas." : `Lançamento registrado por ${resultado.usuario}`,
                        timer: 2000,
                        showConfirmButton: false
                    });
                } else {
                    esconderLoading();
                    if (resultado.mensagem.includes("Senha incorreta")) {
                        localStorage.removeItem("controle_financeiro_senha");
                        fecharModal();
                        abrirModalSenha("Senha incorreta ou expirada! Tente novamente.");
                    } else {
                        Swal.fire({
                            icon: "error",
                            title: "Oops...",
                            text: resultado.mensagem
                        });
                    }
                }

            } catch (erro) {
                esconderLoading();
                console.error("Erro ao salvar:", erro);
                Swal.fire({
                    icon: "error",
                    title: "Erro de Conexão",
                    text: "Não foi possível salvar a conta. Verifique sua rede."
                });
            }
        });
    }

});