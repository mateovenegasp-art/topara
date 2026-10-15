
const BUCKET = "evidencias-topara";

let currentUser = null;
let authMode = "register";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const categoryNames = {
  redes: "Captura de redes",
  lugar: "Foto del lugar",
  participante: "Foto del participante",
  actividad: "Actividad al aire libre"
};

function showToast(message) {
  const toast = $("#toast");

  if (!toast) {
    alert(message);
    return;
  }

  toast.textContent = message;
  toast.classList.remove("hidden");

  clearTimeout(showToast.timer);

  showToast.timer = setTimeout(() => {
    toast.classList.add("hidden");
  }, 4000);
}

function storage() {
  if (!window.supabaseClient) {
    throw new Error("Supabase no está configurado. Revisa supabase.js.");
  }

  return window.supabaseClient.storage.from(BUCKET);
}

function safeFileName(name) {
  return name.normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_");
}

function openAuth(mode) {
  authMode = mode;

  $("#authTitle").textContent =
    mode === "register" ? "Crea tu cuenta" : "Bienvenido de nuevo";

  $("#authIntro").textContent =
    mode === "register"
      ? "Regístrate para organizar tus evidencias."
      : "Ingresa para consultar tus evidencias guardadas.";

  $("#authSubmit").textContent =
    mode === "register" ? "Crear cuenta" : "Iniciar sesión";

  $("#nameWrap").classList.toggle("hidden", mode === "login");
  $("#fullName").required = mode === "register";

  $("#password").autocomplete =
    mode === "register" ? "new-password" : "current-password";

  $("#switchText").textContent =
    mode === "register" ? "¿Ya tienes cuenta?" : "¿Aún no tienes cuenta?";

  $("#switchMode").textContent =
    mode === "register" ? "Inicia sesión" : "Regístrate";

  $("#authModal").classList.remove("hidden");
}

function closeAuth() {
  $("#authModal").classList.add("hidden");
}

function clearSessionUI() {
  currentUser = null;

  $("#workspace").classList.add("hidden");
  $("#signedOut").classList.remove("hidden");
  $("#loginTop").classList.remove("hidden");
  $("#registerTop").classList.remove("hidden");
  $("#logoutTop").classList.add("hidden");
  $("#gallery").innerHTML = "";

  const imagen = $("#fotoPerfil");

  if (imagen) {
    imagen.src = "assets/perfil-predeterminado.png";
  }

  $$("[data-social]").forEach((checkbox) => {
    checkbox.checked = false;
  });
}

async function setSession(user) {
  if (!user) {
    clearSessionUI();
    return;
  }

  currentUser = {
    id: user.id,
    email: user.email,
    name:
      user.user_metadata?.nombre ||
      user.user_metadata?.full_name ||
      user.email?.split("@")[0] ||
      "aventurero"
  };

  $("#signedOut").classList.add("hidden");
  $("#workspace").classList.remove("hidden");
  $("#loginTop").classList.add("hidden");
  $("#registerTop").classList.add("hidden");
  $("#logoutTop").classList.remove("hidden");

  $("#welcome").textContent = `¡Hola, ${currentUser.name}!`;

  const saved = JSON.parse(
    localStorage.getItem(`toparaSocial_${currentUser.id}`) || "{}"
  );

  $$("[data-social]").forEach((checkbox) => {
    checkbox.checked = !!saved[checkbox.dataset.social];
  });

  await loadGallery();
  await cargarFotoPerfil();
}

async function logout() {
  const { error } = await window.supabaseClient.auth.signOut();

  if (error) {
    showToast("No se pudo cerrar sesión: " + error.message);
    return;
  }

  clearSessionUI();
  showToast("Sesión cerrada. Tus evidencias siguen guardadas.");
}

// Registro e inicio de sesión.
$("#authForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const button = $("#authSubmit");
  const name = $("#fullName").value.trim();
  const email = $("#email").value.trim().toLowerCase();
  const password = $("#password").value;

  button.disabled = true;
  button.textContent =
    authMode === "register" ? "Creando cuenta..." : "Ingresando...";

  try {
    if (authMode === "register") {
      const { data, error } =
        await window.supabaseClient.auth.signUp({
          email,
          password,
          options: {
            data: { nombre: name }
          }
        });

      if (error) throw error;

      closeAuth();
      event.target.reset();

      if (data.session && data.user) {
        await setSession(data.user);
        showToast("¡Cuenta creada! Bienvenido a TOPARA.");
      } else {
        showToast(
          "Revisa tu correo para confirmar la cuenta y luego inicia sesión."
        );
      }
    } else {
      const { data, error } =
        await window.supabaseClient.auth.signInWithPassword({
          email,
          password
        });

      if (error) throw error;

      closeAuth();
      event.target.reset();

      if (data.user) {
        await setSession(data.user);
      }

      showToast("¡Sesión iniciada correctamente!");
    }
  } catch (error) {
    showToast(error.message || "Ocurrió un error al autenticarte.");
  } finally {
    button.disabled = false;
    button.textContent =
      authMode === "register" ? "Crear cuenta" : "Iniciar sesión";
  }
});

$("#switchMode").addEventListener("click", (event) => {
  event.preventDefault();
  openAuth(authMode === "register" ? "login" : "register");
});

$("#closeModal").onclick = closeAuth;

$("#authModal").addEventListener("click", (event) => {
  if (event.target === $("#authModal")) closeAuth();
});

$("#loginTop").onclick = () => openAuth("login");
$("#registerTop").onclick = () => openAuth("register");
$("#joinBottom").onclick = () => openAuth("register");

$("#participateBtn").onclick = () => {
  if (!currentUser) {
    openAuth("register");
  } else {
    $("#evidencias").scrollIntoView({ behavior: "smooth" });
  }
};

$("#logoutTop").onclick = logout;

// Subir imágenes a Supabase Storage.
$$("[data-category]").forEach((input) => {
  input.addEventListener("change", async (event) => {
    if (!currentUser) {
      showToast("Inicia sesión primero.");
      event.target.value = "";
      return;
    }

    const category = event.target.dataset.category;
    const files = [...event.target.files];

    let uploaded = 0;
    let profilePhotoUploaded = false;

    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        showToast(`${file.name} no es una imagen.`);
        continue;
      }

      if (file.size > 8 * 1024 * 1024) {
        showToast(`${file.name} supera 8 MB.`);
        continue;
      }

      const path =
        `${currentUser.id}/${category}/${Date.now()}-${safeFileName(file.name)}`;

      try {
        const { error } = await storage().upload(path, file, {
          contentType: file.type,
          upsert: false
        });

        if (error) throw error;

        uploaded++;

        if (category === "participante") {
          profilePhotoUploaded = true;
        }
      } catch (error) {
        console.error("Error subiendo la imagen:", error);
        showToast(`No se pudo subir la foto: ${error.message}`);
      }
    }

    event.target.value = "";

    await loadGallery();

    if (profilePhotoUploaded) {
      await cargarFotoPerfil();
    }

    if (uploaded > 0) {
      showToast(`${uploaded} foto(s) guardada(s) en Supabase.`);
    }
  });
});

// Consultar las imágenes del usuario y mostrarlas en la galería.
async function loadGallery() {
  if (!currentUser) return;

  const gallery = $("#gallery");
  gallery.innerHTML =
    '<div class="empty">Cargando tus evidencias...</div>';

  const items = [];

  try {
    for (const category of Object.keys(categoryNames)) {
      const { data: files, error } = await storage().list(
        `${currentUser.id}/${category}`,
        {
          limit: 100,
          sortBy: { column: "created_at", order: "desc" }
        }
      );

      if (error) throw error;

      for (const file of files || []) {
        if (!file.name || file.name === ".emptyFolderPlaceholder") {
          continue;
        }

        const path = `${currentUser.id}/${category}/${file.name}`;

        const { data, error: urlError } =
          await storage().createSignedUrl(path, 3600);

        if (urlError) throw urlError;

        items.push({
          category,
          name: file.name.replace(/^\d+-/, ""),
          path,
          url: data.signedUrl,
          createdAt: file.created_at || ""
        });
      }
    }
  } catch (error) {
    console.error("Error consultando evidencias:", error);

    gallery.innerHTML =
      '<div class="empty">No se pudieron cargar las fotos. Revisa las políticas de Storage.</div>';

    showToast(error.message);
    return;
  }

  gallery.innerHTML = "";

  if (items.length === 0) {
    gallery.innerHTML =
      '<div class="empty">Todavía no has subido evidencias. Usa los botones de arriba para comenzar.</div>';
  }

  items.sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );

  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "evidence";

    const image = document.createElement("img");
    image.src = item.url;
    image.alt = categoryNames[item.category] || "Evidencia";
    image.loading = "lazy";

    const remove = document.createElement("button");
    remove.className = "delete";
    remove.textContent = "Eliminar";

    remove.onclick = async () => {
      if (!confirm("¿Quieres eliminar esta evidencia?")) return;

      const { error } = await storage().remove([item.path]);

      if (error) {
        showToast("No se pudo eliminar: " + error.message);
        return;
      }

      await loadGallery();

      if (item.category === "participante") {
        await cargarFotoPerfil();
      }

      showToast("Evidencia eliminada.");
    };

    const caption = document.createElement("div");
    caption.className = "ev-caption";
    caption.textContent =
      `${categoryNames[item.category]} · ${item.name}`;

    card.append(image, remove, caption);
    gallery.append(card);
  });

  const categories = new Set(items.map((item) => item.category));

  const count = Object.keys(categoryNames)
    .filter((category) => categories.has(category)).length;

  $("#progressText").textContent = `${count} de 4 categorías con fotos`;
  $("#progressPct").textContent = `${Math.round(count / 4 * 100)}%`;
  $("#progressBar").style.width = `${count / 4 * 100}%`;
}

// Foto de perfil: usa la imagen más reciente de la categoría participante.
async function cargarFotoPerfil() {
  const imagen = $("#fotoPerfil");

  if (!imagen || !currentUser) return;

  try {
    const { data: files, error } = await storage().list(
      `${currentUser.id}/participante`,
      {
        limit: 100,
        sortBy: { column: "created_at", order: "desc" }
      }
    );

    if (error) throw error;

    const fotos = (files || [])
      .filter(file =>
        file.name && file.name !== ".emptyFolderPlaceholder"
      )
      .sort((a, b) =>
        (b.created_at || "").localeCompare(a.created_at || "")
      );

    if (fotos.length === 0) {
      imagen.src = "assets/perfil-predeterminado.png";
      return;
    }

    const path =
      `${currentUser.id}/participante/${fotos[0].name}`;

    const { data, error: urlError } =
      await storage().createSignedUrl(path, 3600);

    if (urlError) throw urlError;

    imagen.onerror = () => {
      console.error("No se pudo mostrar la foto de perfil.");
      imagen.onerror = null;
    };

    imagen.src = data.signedUrl;
  } catch (error) {
    console.error("Error al cargar la foto de perfil:", error);
  }
}

// Guardar las selecciones sociales en este navegador.
$$("[data-social]").forEach((checkbox) => {
  checkbox.addEventListener("change", () => {
    if (!currentUser) {
      checkbox.checked = false;
      openAuth("login");
      return;
    }

    const key = `toparaSocial_${currentUser.id}`;
    const state = JSON.parse(localStorage.getItem(key) || "{}");

    state[checkbox.dataset.social] = checkbox.checked;
    localStorage.setItem(key, JSON.stringify(state));
  });
});

// Recuperar la sesión al abrir TOPARA.
(async function initialize() {
  try {
    if (!window.supabaseClient) {
      throw new Error("Revisa la configuración de supabase.js.");
    }

    const { data, error } =
      await window.supabaseClient.auth.getSession();

    if (error) throw error;

    if (data.session?.user) {
      await setSession(data.session.user);
    }

    window.supabaseClient.auth.onAuthStateChange(
      (event, sessionData) => {
        if (sessionData?.user) {
          setTimeout(() => setSession(sessionData.user), 0);
        } else if (event === "SIGNED_OUT") {
          clearSessionUI();
        }
      }
    );
  } catch (error) {
    console.error("Error inicializando TOPARA:", error);
    showToast(error.message || "No se pudo iniciar TOPARA.");
  }
})();
