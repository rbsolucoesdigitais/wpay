document.addEventListener("DOMContentLoaded", () => {

    // ==========================================
    // CONFIGURAÇÃO DO SUPABASE (AUTH + SDK + PUSH)
    // ==========================================
    const SUPABASE_URL = "https://ghecmywfruopddenylfh.supabase.co";
    const SUPABASE_ANON_KEY = "sb_publishable_kcj0d9LQPRBjpIYl71WIAg_NQyoiyll";
    const TABELA_CONTAS = "contas";
    const VAPID_PUBLIC_KEY = "BOMauVNTMqbbLzLec1mrQiba2CvS35WQOHnTr_ph8napzEWBAo4Dt_I61PQ1rmFF3rpgte4Ru_e0mqQyaa1RNAk";
    const CHAVE_SESSAO_ABA = "controle_financeiro_sessao_ativa";

    const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
            persistSession: true,
            autoRefreshToken: true
        }
    });

    function resolverNomeUsuario(user) {
        if (!user || !user.email) return "Usuário";
        const emailLower = user.email.toLowerCase();
        if (emailLower.startsWith("ribeiro")) return "Ribeiro";
        if (emailLower.startsWith("jussara")) return "Jussara";
        return user.email.split("@")[0];
    }

    // ==========================================
    // PWA: SERVICE WORKER E INSTALAÇÃO
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
            title: "Instalar Controle Financeiro?",
            text: "Adicione o app à sua tela inicial para acessar mais rápido, como um aplicativo nativo.",
            icon: "info",
            showCancelButton: true,
            confirmButtonColor: "#4263eb",
            cancelButtonColor: "#64748b",
            confirmButtonText: "Instalar app",
            cancelButtonText: "Agora não"
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

        if (btnInstalarApp && usuarioLogadoNome) {
            btnInstalarApp.style.display = "inline-flex";
        }

        if (!jaSolicitouNestaSessao && !loadingAtivo && usuarioLogadoNome && (!authModal || !authModal.classList.contains("show"))) {
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
    // WEB PUSH: REGISTRO E DISPARO (ANDROID)
    // ==========================================
    function urlBase64ToUint8Array(base64String) {
        const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
        const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }

    async function registrarNotificacaoPush(nomeUsuario) {
        try {
            if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
                return;
            }
            if (!VAPID_PUBLIC_KEY || VAPID_PUBLIC_KEY.startsWith("COLE_AQUI")) return;

            let permissao = Notification.permission;
            if (permissao === "default") {
                permissao = await Notification.requestPermission();
            }
            if (permissao !== "granted") return;

            const registroSW = await navigator.serviceWorker.ready;
            let subscription = await registroSW.pushManager.getSubscription();

            if (!subscription) {
                subscription = await registroSW.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
                });
            }

            const jsonSub = subscription.toJSON();
            if (!jsonSub.endpoint || !jsonSub.keys || !jsonSub.keys.p256dh || !jsonSub.keys.auth) {
                return;
            }

            const { error } = await supabaseClient
                .from("push_subscriptions")
                .upsert([{
                    usuario: nomeUsuario,
                    endpoint: jsonSub.endpoint,
                    p256dh: jsonSub.keys.p256dh,
                    auth: jsonSub.keys.auth
                }], { onConflict: "endpoint" });

            if (error) {
                console.error("Erro ao salvar assinatura push:", error);
            }
        } catch (erro) {
            console.error("Falha ao registrar Web Push:", erro);
        }
    }

    async function notificarParceiro(titulo, corpo, url = "./") {
        if (!usuarioLogadoNome) return;

        try {
            const { error } = await supabaseClient.functions.invoke("notificar-parceiro", {
                body: {
                    autor: usuarioLogadoNome,
                    titulo,
                    corpo,
                    url
                }
            });

            if (error) {
                console.error("Erro ao invocar notificar-parceiro:", error);
            }
        } catch (erro) {
            console.error("Falha de rede ao notificar parceiro:", erro);
        }
    }

    // ==========================================
    // INICIALIZAÇÃO DOS ELEMENTOS
    // ==========================================
    const navItems = document.querySelectorAll(".nav-item");
    const contents = document.querySelectorAll(".tab-content");
    const botoesLogout = document.querySelectorAll(".btn-logout");

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

    // Modal de Autenticação (Supabase Auth)
    const authModal = document.getElementById("authModal");
    const authForm = document.getElementById("authForm");
    const emailInput = document.getElementById("emailInput");
    const senhaInput = document.getElementById("senhaInput");
    const authError = document.getElementById("authError");

    let idEmEdicao = null;
    let contasEmMemoria = [];
    let filtroAtual = "Todos";
    let termoBusca = "";
    let loadingAtivo = false;
    let usuarioLogadoNome = "";
    let canalRealtime = null;
    let timerRealtime = null;

    // ==========================================
    // CONTROLE CENTRALIZADO DE LOADING
    // ==========================================
    function mostrarLoading(titulo = "Carregando...", texto = "Aguarde enquanto sincronizamos os dados") {
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
        if (eventoInstalacaoPendente && !jaSolicitouNestaSessao && usuarioLogadoNome && (!authModal || !authModal.classList.contains("show"))) {
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
    // CARREGAR E RENDERIZAR CONTAS (SUPABASE)
    // ==========================================
    async function carregarContas({ gerenciarLoading = true } = {}) {
        if (gerenciarLoading) {
            mostrarLoading("Carregando informações...", "Por favor, aguarde.");
        }

        try {
            const { data, error } = await supabaseClient
                .from(TABELA_CONTAS)
                .select("*");

            if (error) {
                throw error;
            }

            contasEmMemoria = Array.isArray(data)
                ? data.map(item => ({
                    id: String(item.id),
                    usuario: item.usuario || "Usuário",
                    conta: item.conta || "",
                    vencimento: item.vencimento || "",
                    valor: Number(item.valor) || 0,
                    descricao: item.descricao || "",
                    status: item.status === "Pago" ? "Pago" : "Pendente",
                    criadoEm: item.criado_em || item.criadoEm || ""
                }))
                : [];

            aplicarFiltroERenderizar();
            atualizarDash(contasEmMemoria);
        } catch (erro) {
            console.error("Erro ao carregar contas no Supabase:", erro);
            if (accountsList) {
                accountsList.innerHTML = `<p style="text-align: center; color: #e11d48; padding: 20px;">Erro de conexão ao carregar os dados.</p>`;
            }
        } finally {
            if (gerenciarLoading) {
                esconderLoading();
            }
        }
    }

    // ==========================================
    // REALTIME: ATUALIZAÇÃO AUTOMÁTICA SEM RELOAD
    // ==========================================
    function exibirAvisoDeAlteracao(payload) {
        if (!usuarioLogadoNome || typeof Swal === "undefined") return;

        const registro = payload.new && Object.keys(payload.new).length > 0
            ? payload.new
            : payload.old;

        if (!registro) return;

        const autor = registro.usuario || "";
        if (!autor || autor === usuarioLogadoNome) return;

        const nomeConta = registro.conta || "uma conta";
        let mensagem = `${autor} alterou "${nomeConta}".`;

        if (payload.eventType === "INSERT") {
            mensagem = `${autor} adicionou "${nomeConta}".`;
        } else if (payload.eventType === "UPDATE") {
            mensagem = registro.status === "Pago"
                ? `${autor} quitou "${nomeConta}".`
                : `${autor} atualizou "${nomeConta}".`;
        } else if (payload.eventType === "DELETE") {
            mensagem = `${autor} excluiu "${nomeConta}".`;
        }

        Swal.fire({
            toast: true,
            position: "top",
            icon: "info",
            title: mensagem,
            showConfirmButton: false,
            timer: 3200,
            timerProgressBar: true
        });
    }

    function agendarSincronizacaoRealtime() {
        if (!usuarioLogadoNome || loadingAtivo) return;
        if (timerRealtime) clearTimeout(timerRealtime);

        timerRealtime = setTimeout(async () => {
            if (!usuarioLogadoNome || loadingAtivo) return;
            await carregarContas({ gerenciarLoading: false });
        }, 150);
    }

    async function iniciarRealtime() {
        await pararRealtime();

        canalRealtime = supabaseClient
            .channel(`contas-realtime-${Date.now()}`)
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: TABELA_CONTAS
                },
                (payload) => {
                    exibirAvisoDeAlteracao(payload);
                    agendarSincronizacaoRealtime();
                }
            )
            .subscribe((status) => {
                console.log("Status Realtime:", status);
            });
    }

    async function pararRealtime() {
        if (timerRealtime) {
            clearTimeout(timerRealtime);
            timerRealtime = null;
        }
        if (canalRealtime) {
            try {
                await supabaseClient.removeChannel(canalRealtime);
            } catch (erro) {
                console.error("Erro ao encerrar canal Realtime:", erro);
            }
            canalRealtime = null;
        }
    }

    document.addEventListener("visibilitychange", async () => {
        if (document.visibilityState === "visible" && usuarioLogadoNome) {
            await carregarContas({ gerenciarLoading: false });
            await iniciarRealtime();
        }
    });

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

        const novoStatus = item.status === "Pago" ? "Pendente" : "Pago";
        mostrarLoading(
            novoStatus === "Pago" ? "Quitando conta..." : "Reabrindo conta...",
            "Atualizando status"
        );

        try {
            const { error } = await supabaseClient
                .from(TABELA_CONTAS)
                .update({
                    status: novoStatus,
                    usuario: usuarioLogadoNome || item.usuario
                })
                .eq("id", item.id);

            if (error) {
                throw error;
            }

            const tituloPush = novoStatus === "Pago" ? "Conta quitada" : "Conta reaberta";
            const corpoPush = novoStatus === "Pago"
                ? `${usuarioLogadoNome} quitou "${item.conta}" (${formatarMoeda(item.valor)}).`
                : `${usuarioLogadoNome} reabriu "${item.conta}" (${formatarMoeda(item.valor)}).`;

            await notificarParceiro(tituloPush, corpoPush, "./");
            await carregarContas({ gerenciarLoading: false });
            esconderLoading();
        } catch (erro) {
            esconderLoading();
            console.error("Erro ao alterar status:", erro);
            Swal.fire({ icon: "error", title: "Erro", text: "Não foi possível atualizar o status." });
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

        mostrarLoading("Excluindo...", "Removendo registro");

        try {
            const { error } = await supabaseClient
                .from(TABELA_CONTAS)
                .delete()
                .eq("id", item.id);

            if (error) {
                throw error;
            }

            await notificarParceiro(
                "Conta excluída",
                `${usuarioLogadoNome} excluiu "${item.conta}" (${formatarMoeda(item.valor)}).`,
                "./"
            );
            await carregarContas({ gerenciarLoading: false });
            esconderLoading();
            Swal.fire({
                icon: "success",
                title: "Excluída!",
                text: "A conta foi removida com sucesso.",
                timer: 1800,
                showConfirmButton: false
            });
        } catch (erro) {
            esconderLoading();
            console.error("Erro ao excluir:", erro);
            Swal.fire({ icon: "error", title: "Erro", text: "Não foi possível excluir a conta." });
        }
    }

    // ==========================================
    // CONTROLE DE ACESSO E LOGOUT (SUPABASE AUTH)
    // ==========================================
    function atualizarVisibilidadeLogout(logado) {
        botoesLogout.forEach(btn => {
            btn.style.display = logado ? "inline-flex" : "none";
        });
        if (btnInstalarApp) {
            btnInstalarApp.style.display = logado && eventoInstalacaoPendente && !appJaInstalado ? "inline-flex" : "none";
        }
    }

    function abrirModalSenha(mensagemErro = "") {
        esconderLoading();
        atualizarVisibilidadeLogout(false);
        if (!authModal) return;

        if (mensagemErro && authError) {
            authError.textContent = mensagemErro;
            authError.style.display = "block";
        } else if (authError) {
            authError.style.display = "none";
        }

        authModal.classList.add("show");
        setTimeout(() => {
            if (emailInput && !emailInput.value) {
                emailInput.focus();
            } else if (senhaInput) {
                senhaInput.focus();
            }
        }, 100);
    }

    function fecharModalSenha() {
        if (!authModal) return;
        authModal.classList.remove("show");
        if (authForm) authForm.reset();
        if (authError) authError.style.display = "none";
    }

    async function fazerLogout({ confirmar = true } = {}) {
        if (loadingAtivo) return;

        if (confirmar && typeof Swal !== "undefined") {
            const confirmacao = await Swal.fire({
                title: "Sair da conta?",
                text: "Você precisará fazer login novamente para acessar as contas.",
                icon: "question",
                showCancelButton: true,
                confirmButtonColor: "#e11d48",
                cancelButtonColor: "#64748b",
                confirmButtonText: "Sim, sair",
                cancelButtonText: "Cancelar"
            });

            if (!confirmacao.isConfirmed) return;
        }

        mostrarLoading("Saindo...", "Encerrando sua sessão");

        try {
            sessionStorage.removeItem(CHAVE_SESSAO_ABA);
            await pararRealtime();
            await supabaseClient.auth.signOut();
        } catch (erro) {
            console.error("Erro ao encerrar sessão no Supabase:", erro);
        } finally {
            usuarioLogadoNome = "";
            contasEmMemoria = [];
            idEmEdicao = null;
            fecharModal();
            if (accountsList) accountsList.innerHTML = "";
            atualizarDash([]);
            atualizarVisibilidadeLogout(false);
            esconderLoading();
            abrirModalSenha();
        }
    }

    botoesLogout.forEach(btn => {
        btn.addEventListener("click", () => fazerLogout({ confirmar: true }));
    });

    async function checarSessaoInicial() {
        const ehReloadMesmaSessao = sessionStorage.getItem(CHAVE_SESSAO_ABA) === "1";

        if (ehReloadMesmaSessao) {
            mostrarLoading("Carregando...", "Restaurando sessão");
            const { data: { session }, error } = await supabaseClient.auth.getSession();

            if (!error && session && session.user) {
                usuarioLogadoNome = resolverNomeUsuario(session.user);
                atualizarVisibilidadeLogout(true);
                await registrarNotificacaoPush(usuarioLogadoNome);
                await iniciarRealtime();
                await carregarContas({ gerenciarLoading: false });
                esconderLoading();
                return;
            }
        }

        sessionStorage.removeItem(CHAVE_SESSAO_ABA);
        usuarioLogadoNome = "";
        contasEmMemoria = [];
        atualizarVisibilidadeLogout(false);
        if (accountsList) accountsList.innerHTML = "";
        atualizarDash([]);
        await supabaseClient.auth.signOut();
        abrirModalSenha();
    }

    checarSessaoInicial();

    if (authForm) {
        authForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            if (loadingAtivo) return;

            const emailDigitado = emailInput.value.trim();
            const senhaDigitada = senhaInput.value;

            if (!emailDigitado || !senhaDigitada) {
                abrirModalSenha("Por favor, informe e-mail e senha.");
                return;
            }

            mostrarLoading("Autenticando...", "Validando credenciais");

            const { data, error } = await supabaseClient.auth.signInWithPassword({
                email: emailDigitado,
                password: senhaDigitada
            });

            if (error || !data.user) {
                abrirModalSenha("E-mail ou senha inválidos.");
                return;
            }

            sessionStorage.setItem(CHAVE_SESSAO_ABA, "1");
            usuarioLogadoNome = resolverNomeUsuario(data.user);
            atualizarVisibilidadeLogout(true);
            fecharModalSenha();
            await registrarNotificacaoPush(usuarioLogadoNome);
            await iniciarRealtime();
            await carregarContas({ gerenciarLoading: false });
            esconderLoading();
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
    async function garantirUsuarioAutenticado() {
        if (usuarioLogadoNome) return true;
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session && session.user) {
            usuarioLogadoNome = resolverNomeUsuario(session.user);
            atualizarVisibilidadeLogout(true);
            return true;
        }
        return false;
    }

    async function abrirModal() {
        const autenticado = await garantirUsuarioAutenticado();
        if (!autenticado) {
            abrirModalSenha("Você precisa entrar primeiro.");
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

    async function abrirModalEdicao(item) {
        const autenticado = await garantirUsuarioAutenticado();
        if (!autenticado) {
            abrirModalSenha("Você precisa entrar primeiro.");
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
    // SALVAR (CRIAR OU EDITAR) CONTA (SUPABASE)
    // ==========================================
    if (accountForm) {
        accountForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            if (loadingAtivo) return;

            const autenticado = await garantirUsuarioAutenticado();
            if (!autenticado) {
                fecharModal();
                abrirModalSenha("Sessão expirada. Entre novamente.");
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

            mostrarLoading(
                editando ? "Atualizando conta..." : "Salvando conta...",
                "Gravando no Supabase e atualizando lista"
            );

            try {
                if (editando) {
                    const { error } = await supabaseClient
                        .from(TABELA_CONTAS)
                        .update({
                            usuario: usuarioLogadoNome,
                            conta,
                            vencimento,
                            valor,
                            descricao
                        })
                        .eq("id", idEmEdicao);

                    if (error) {
                        throw error;
                    }
                } else {
                    const novoId = String(Date.now());
                    const { error } = await supabaseClient
                        .from(TABELA_CONTAS)
                        .insert([{
                            id: novoId,
                            usuario: usuarioLogadoNome,
                            conta,
                            vencimento,
                            valor,
                            descricao,
                            status: "Pendente",
                            criado_em: new Date().toISOString()
                        }]);

                    if (error) {
                        throw error;
                    }
                }

                fecharModal();

                const tituloPush = editando ? "Conta atualizada" : "Nova conta adicionada";
                const corpoPush = editando
                    ? `${usuarioLogadoNome} editou "${conta}" (${formatarMoeda(valor)}).`
                    : `${usuarioLogadoNome} adicionou "${conta}" (${formatarMoeda(valor)}) vence ${formatarData(vencimento)}.`;

                await notificarParceiro(tituloPush, corpoPush, "./");
                await carregarContas({ gerenciarLoading: false });
                esconderLoading();

                Swal.fire({
                    icon: "success",
                    title: editando ? "Conta atualizada!" : "Conta salva!",
                    text: editando ? "As alterações foram salvas." : `Lançamento registrado por ${usuarioLogadoNome}`,
                    timer: 2000,
                    showConfirmButton: false
                });
            } catch (erro) {
                esconderLoading();
                console.error("Erro ao salvar no Supabase:", erro);
                Swal.fire({
                    icon: "error",
                    title: "Erro de Conexão",
                    text: "Não foi possível salvar a conta. Verifique sua rede."
                });
            }
        });
    }

});
