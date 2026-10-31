/**
 * Vencimiento2026 — Lógica modular de interfaz y persistencia (js/app.js)
 */

let dbModuleInstance = null;
let dbConnection = null;
let initPromise = null;

/**
 * Función pública para solicitar la conexión a IndexedDB de manera controlada.
 * Permite que futuros módulos obtengan la conexión de forma segura y concurrente.
 * 
 * @returns {Promise<IDBDatabase>} Promesa que se resuelve con la conexión activa.
 */
window.getDatabaseConnection = async function() {
    // 1. Devolver la conexión existente si ya está abierta y disponible
    if (dbConnection) {
        return dbConnection;
    }

    // 2 y 7. Si hay una inicialización en curso, esperar a que termine (permite solicitudes simultáneas)
    if (initPromise) {
        return await initPromise;
    }

    // 3 y 4. Iniciar la carga del módulo y apertura reutilizando la protección openPromise de database.js
    initPromise = (async () => {
        try {
            if (!dbModuleInstance) {
                dbModuleInstance = await import(new URL('js/database.js', document.baseURI).href);
            }
            dbConnection = await dbModuleInstance.openDatabase();

            // Registrar listener para versionchange utilizando addEventListener sin sobrescribir onversionchange de database.js
            dbConnection.addEventListener('versionchange', () => {
                dbConnection = null;
            });

            return dbConnection;
        } catch (error) {
            dbConnection = null;
            throw new Error(`Error al obtener la conexión a IndexedDB: ${error.message || error}`);
        } finally {
            initPromise = null;
        }
    })();

    return await initPromise;
};

document.addEventListener('DOMContentLoaded', () => {
    // 1. Actualización automática de la fecha según el dispositivo
    const currentDateEl = document.getElementById('currentDate');
    if (currentDateEl) {
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        const today = new Date();
        const formattedDate = today.toLocaleDateString(undefined, options);
        currentDateEl.textContent = formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);
    }

    // 2. Inicialización asíncrona y aislada de IndexedDB al cargar la app mediante la función pública
    (async () => {
        try {
            await window.getDatabaseConnection();
            console.log('Vencimiento2026DB inicializada y abierta correctamente.');
        } catch (error) {
            console.error('Error al inicializar IndexedDB (no bloqueante):', error);
        }
    })();

    // 3. Función centralizada de navegación entre secciones sin recargar la página
    function navigateToSection(targetId) {
        const targetSection = document.getElementById(targetId);
        if (!targetSection) return false;

        // Ocultar todas las secciones con la clase app-section
        const sections = document.querySelectorAll('.app-section');
        sections.forEach(sec => {
            sec.hidden = true;
        });

        // Mostrar únicamente la sección correspondiente al destino
        targetSection.hidden = false;

        // Sincronizar la clase active del elemento <li> en el menú lateral
        const navLinks = document.querySelectorAll('.sidebar-nav a');
        navLinks.forEach(link => {
            const li = link.closest('li');
            if (li) {
                const href = link.getAttribute('href');
                if (href === `#${targetId}` || href === `#` + targetId) {
                    li.classList.add('active');
                } else {
                    li.classList.remove('active');
                }
            }
        });

        // Llevar la vista al comienzo del contenido principal suavemente
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return true;
    }

    // 4. Configurar eventos de clic en los enlaces del menú lateral
    const navLinks = document.querySelectorAll('.sidebar-nav a');
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const href = link.getAttribute('href');
            if (href && href.startsWith('#')) {
                const targetId = href.substring(1);
                if (document.getElementById(targetId)) {
                    navigateToSection(targetId);
                    if (window.innerWidth <= 768) {
                        closeMobileMenu(true);
                    }
                }
            }
        });
    });

    // 5. Botón de configuración del encabezado
    const btnConfigHeader = document.getElementById('btnConfigHeader');
    if (btnConfigHeader) {
        btnConfigHeader.addEventListener('click', (e) => {
            e.preventDefault();
            if (document.getElementById('configuracion')) {
                navigateToSection('configuracion');
            }
        });
    }

    // 6. Menú lateral de escritorio (Expandir / Contraer) con ARIA
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebarToggle');
    const appLayout = document.getElementById('appLayout');

    if (sidebarToggle && sidebar && appLayout) {
        sidebarToggle.addEventListener('click', () => {
            const isCollapsed = sidebar.classList.toggle('collapsed');
            appLayout.classList.toggle('sidebar-collapsed', isCollapsed);

            sidebarToggle.setAttribute('aria-expanded', !isCollapsed);
            sidebarToggle.setAttribute('aria-label', isCollapsed ? 'Expandir menú de escritorio' : 'Contraer menú de escritorio');
            sidebarToggle.textContent = isCollapsed ? '▶' : '◀';
        });
    }

    // 7. Menú móvil con gestión de inert y retorno de foco
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const sidebarCloseMobile = document.getElementById('sidebarCloseMobile');
    const sidebarBackdrop = document.getElementById('sidebarBackdrop');

    function updateMobileInert() {
        if (window.innerWidth <= 768) {
            if (sidebar && !sidebar.classList.contains('mobile-open')) {
                sidebar.setAttribute('inert', '');
            } else if (sidebar) {
                sidebar.removeAttribute('inert');
            }
        } else {
            if (sidebar) {
                sidebar.removeAttribute('inert');
            }
        }
    }

    updateMobileInert();

    function openMobileMenu() {
        if (!sidebar) return;
        sidebar.classList.add('mobile-open');
        sidebar.removeAttribute('inert');
        if (sidebarBackdrop) sidebarBackdrop.classList.add('active');
        if (mobileMenuBtn) mobileMenuBtn.setAttribute('aria-expanded', 'true');
    }

    function closeMobileMenu(returnFocus = true) {
        if (!sidebar) return;
        const wasOpen = sidebar.classList.contains('mobile-open');
        sidebar.classList.remove('mobile-open');
        updateMobileInert();
        if (sidebarBackdrop) sidebarBackdrop.classList.remove('active');
        if (mobileMenuBtn) {
            mobileMenuBtn.setAttribute('aria-expanded', 'false');
            if (wasOpen && returnFocus) {
                mobileMenuBtn.focus();
            }
        }
    }

    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', () => {
            if (sidebar && sidebar.classList.contains('mobile-open')) {
                closeMobileMenu(true);
            } else {
                openMobileMenu();
            }
        });
    }

    if (sidebarCloseMobile) {
        sidebarCloseMobile.addEventListener('click', () => closeMobileMenu(true));
    }

    if (sidebarBackdrop) {
        sidebarBackdrop.addEventListener('click', () => closeMobileMenu(true));
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (sidebar && sidebar.classList.contains('mobile-open')) {
                closeMobileMenu(true);
            }
        }
    });

    let wasDesktop = window.innerWidth > 768;

    window.addEventListener('resize', () => {
        const isNowDesktop = window.innerWidth > 768;

        if (!wasDesktop && isNowDesktop) {
            if (sidebar) {
                sidebar.classList.remove('mobile-open');
                sidebar.removeAttribute('inert');
            }
            if (sidebarBackdrop) {
                sidebarBackdrop.classList.remove('active');
            }
            if (mobileMenuBtn) {
                mobileMenuBtn.setAttribute('aria-expanded', 'false');
            }
        } else if (wasDesktop && !isNowDesktop) {
            if (sidebar) {
                sidebar.classList.remove('mobile-open');
                sidebar.setAttribute('inert', '');
            }
            if (sidebarBackdrop) {
                sidebarBackdrop.classList.remove('active');
            }
            if (mobileMenuBtn) {
                mobileMenuBtn.setAttribute('aria-expanded', 'false');
            }
        }

        wasDesktop = isNowDesktop;
    });
});