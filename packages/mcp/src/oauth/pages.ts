/** Minimal server-rendered sign-in pages for the OAuth authorization flow. */

/** Escape a string for safe interpolation into HTML text/attribute context. */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function layout(title: string, inner: string): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
  :root { --green: #009b3a; --ink: #0b1f12; --muted: #5b6b60; --bg: #f5f7f5; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 16px/1.5 -apple-system, system-ui, sans-serif; background: var(--bg); color: var(--ink); }
  .card { max-width: 420px; margin: 8vh auto; padding: 32px; background: #fff; border-radius: 16px; box-shadow: 0 8px 30px rgba(0,0,0,.08); }
  h1 { font-size: 20px; margin: 0 0 4px; }
  p { color: var(--muted); margin: 0 0 20px; }
  label { display: block; font-weight: 600; font-size: 14px; margin: 0 0 6px; }
  input[type=email], input[type=text] { width: 100%; padding: 12px; border: 1px solid #d4ddd6; border-radius: 10px; font-size: 16px; }
  button { width: 100%; margin-top: 16px; padding: 12px; border: 0; border-radius: 10px; background: var(--green); color: #fff; font-size: 16px; font-weight: 600; cursor: pointer; }
  button:hover { background: #007e2f; }
  .err { background: #fdecec; color: #a31212; padding: 10px 12px; border-radius: 10px; margin: 0 0 16px; font-size: 14px; }
  .brand { display: flex; align-items: center; gap: 8px; margin-bottom: 20px; font-weight: 700; color: var(--green); }
  .dot { width: 12px; height: 12px; border-radius: 50%; background: var(--green); }
</style>
</head>
<body>
  <div class="card">
    <div class="brand"><span class="dot"></span> Penca Ovación</div>
    ${inner}
  </div>
</body>
</html>`;
}

function errorBanner(error?: string): string {
  return error ? `<div class="err">${esc(error)}</div>` : '';
}

/** Step 1: ask for the account email. */
export function emailPage(opts: { loginId: string; error?: string }): string {
  return layout(
    'Iniciar sesión',
    `<h1>Iniciá sesión</h1>
     <p>Te enviamos un enlace mágico por correo. No necesitás contraseña.</p>
     ${errorBanner(opts.error)}
     <form method="post" action="/oauth/authorize/email">
       <input type="hidden" name="login_id" value="${esc(opts.loginId)}">
       <label for="email">Correo electrónico</label>
       <input id="email" name="email" type="email" required autofocus placeholder="vos@ejemplo.com">
       <button type="submit">Enviar enlace mágico</button>
     </form>`,
  );
}

/** Step 2: paste the magic link / token from the email. */
export function magicPage(opts: { loginId: string; email: string; error?: string }): string {
  return layout(
    'Confirmá el enlace',
    `<h1>Revisá tu correo</h1>
     <p>Enviamos un enlace a <strong>${esc(opts.email)}</strong>. Abrilo y pegá acá el enlace (o su token).</p>
     ${errorBanner(opts.error)}
     <form method="post" action="/oauth/authorize/complete">
       <input type="hidden" name="login_id" value="${esc(opts.loginId)}">
       <label for="token">Enlace mágico o token</label>
       <input id="token" name="token" type="text" required autofocus placeholder="https://…  o  el token">
       <button type="submit">Confirmar e iniciar sesión</button>
     </form>`,
  );
}

/** A standalone error page (used when we cannot safely redirect back). */
export function errorPage(message: string): string {
  return layout('Error', `<h1>No se pudo continuar</h1><p>${esc(message)}</p>`);
}
