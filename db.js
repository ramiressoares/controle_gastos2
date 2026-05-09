const DB_NAME = "controle_financeiro";
const DB_VERSION = 1;

let dbInstance = null;

export function initDB() {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains("usuarios")) {
        const usuarios = db.createObjectStore("usuarios", {
          keyPath: "id",
          autoIncrement: true,
        });
        usuarios.createIndex("email", "email", { unique: true });
      }

      if (!db.objectStoreNames.contains("movimentacoes")) {
        const movimentacoes = db.createObjectStore("movimentacoes", {
          keyPath: "id",
          autoIncrement: true,
        });
        movimentacoes.createIndex("usuario_id", "usuario_id", { unique: false });
        movimentacoes.createIndex("tipo", "tipo", { unique: false });
        movimentacoes.createIndex("categoria", "categoria", { unique: false });
        movimentacoes.createIndex("data", "data", { unique: false });
      }

      if (!db.objectStoreNames.contains("metas")) {
        const metas = db.createObjectStore("metas", {
          keyPath: "id",
          autoIncrement: true,
        });
        metas.createIndex("usuario_mes", ["usuario_id", "mes"], { unique: true });
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onerror = () => reject(request.error);
  });
}

async function runTransaction(storeName, mode, handler) {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);

    handler(store, resolve, reject);
  });
}

export async function criarUsuario(usuario) {
  await initDB();
  return new Promise((resolve, reject) => {
    const tx = dbInstance.transaction("usuarios", "readwrite");
    const store = tx.objectStore("usuarios");
    const request = store.add(usuario);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function buscarUsuarioPorEmail(email) {
  await initDB();
  return new Promise((resolve, reject) => {
    const tx = dbInstance.transaction("usuarios", "readonly");
    const store = tx.objectStore("usuarios");
    const idx = store.index("email");
    const request = idx.get(email.toLowerCase());

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function buscarUsuarioPorId(id) {
  await initDB();
  return new Promise((resolve, reject) => {
    const tx = dbInstance.transaction("usuarios", "readonly");
    const store = tx.objectStore("usuarios");
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function adicionarMovimentacao(movimentacao) {
  await initDB();
  return new Promise((resolve, reject) => {
    const tx = dbInstance.transaction("movimentacoes", "readwrite");
    const store = tx.objectStore("movimentacoes");
    const request = store.add(movimentacao);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function atualizarMovimentacao(id, dados) {
  await initDB();
  return new Promise((resolve, reject) => {
    const tx = dbInstance.transaction("movimentacoes", "readwrite");
    const store = tx.objectStore("movimentacoes");
    const getReq = store.get(id);

    getReq.onsuccess = () => {
      const atual = getReq.result;
      if (!atual) {
        reject(new Error("Movimentacao nao encontrada"));
        return;
      }

      const updateReq = store.put({ ...atual, ...dados, id });
      updateReq.onsuccess = () => resolve(updateReq.result);
      updateReq.onerror = () => reject(updateReq.error);
    };

    getReq.onerror = () => reject(getReq.error);
  });
}

export async function excluirMovimentacao(id) {
  await runTransaction("movimentacoes", "readwrite", (store, resolve, reject) => {
    const request = store.delete(id);
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

export async function listarMovimentacoesUsuario(usuarioId) {
  await initDB();
  return new Promise((resolve, reject) => {
    const tx = dbInstance.transaction("movimentacoes", "readonly");
    const store = tx.objectStore("movimentacoes");
    const idx = store.index("usuario_id");
    const request = idx.getAll(usuarioId);

    request.onsuccess = () => {
      const itens = (request.result || []).sort((a, b) => b.data.localeCompare(a.data));
      resolve(itens);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function salvarMetaMensal({ usuario_id, mes, valor_meta }) {
  await initDB();
  return new Promise((resolve, reject) => {
    const tx = dbInstance.transaction("metas", "readwrite");
    const store = tx.objectStore("metas");
    const idx = store.index("usuario_mes");
    const getReq = idx.get([usuario_id, mes]);

    getReq.onsuccess = () => {
      const existente = getReq.result;
      if (existente) {
        const updateReq = store.put({ ...existente, valor_meta });
        updateReq.onsuccess = () => resolve(updateReq.result);
        updateReq.onerror = () => reject(updateReq.error);
      } else {
        const addReq = store.add({ usuario_id, mes, valor_meta });
        addReq.onsuccess = () => resolve(addReq.result);
        addReq.onerror = () => reject(addReq.error);
      }
    };

    getReq.onerror = () => reject(getReq.error);
  });
}

export async function buscarMetaMensal(usuarioId, mes) {
  await initDB();
  return new Promise((resolve, reject) => {
    const tx = dbInstance.transaction("metas", "readonly");
    const store = tx.objectStore("metas");
    const idx = store.index("usuario_mes");
    const request = idx.get([usuarioId, mes]);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function listarMetasUsuario(usuarioId) {
  await initDB();
  return new Promise((resolve, reject) => {
    const tx = dbInstance.transaction("metas", "readonly");
    const store = tx.objectStore("metas");
    const request = store.getAll();

    request.onsuccess = () => {
      const itens = (request.result || [])
        .filter((meta) => meta.usuario_id === usuarioId)
        .sort((a, b) => a.mes.localeCompare(b.mes));
      resolve(itens);
    };

    request.onerror = () => reject(request.error);
  });
}
