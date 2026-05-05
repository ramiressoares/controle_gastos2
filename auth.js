import {
  buscarUsuarioPorEmail,
  buscarUsuarioPorId,
  criarUsuario,
} from "./db.js";

const SESSION_KEY = "cf_usuario_id";

export async function gerarHashSenha(senha) {
  const encoder = new TextEncoder();
  const data = encoder.encode(senha);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function registrarUsuario({ nome, email, senha }) {
  const emailNormalizado = email.trim().toLowerCase();
  const existente = await buscarUsuarioPorEmail(emailNormalizado);

  if (existente) {
    throw new Error("Email ja cadastrado");
  }

  const senha_hash = await gerarHashSenha(senha);
  const id = await criarUsuario({
    nome: nome.trim(),
    email: emailNormalizado,
    senha_hash,
    criado_em: new Date().toISOString(),
  });

  return { id };
}

export async function loginUsuario({ email, senha }) {
  const emailNormalizado = email.trim().toLowerCase();
  const usuario = await buscarUsuarioPorEmail(emailNormalizado);

  if (!usuario) {
    throw new Error("Usuario nao encontrado");
  }

  const senha_hash = await gerarHashSenha(senha);
  if (senha_hash !== usuario.senha_hash) {
    throw new Error("Senha invalida");
  }

  localStorage.setItem(SESSION_KEY, String(usuario.id));
  return usuario;
}

export function logoutUsuario() {
  localStorage.removeItem(SESSION_KEY);
}

export async function obterUsuarioLogado() {
  const id = Number(localStorage.getItem(SESSION_KEY));
  if (!id) return null;
  return buscarUsuarioPorId(id);
}
