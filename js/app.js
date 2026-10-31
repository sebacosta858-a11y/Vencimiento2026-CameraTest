/**
 * Vencimiento2026 — Lógica modular de interfaz (js/app.js)
 */

document.addEventListener('DOMContentLoaded', () => {
    // 1. Actualización automática de la fecha según el dispositivo
    const currentDateEl = document.getElementById('currentDate');
    if (currentDateEl) {
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        const today = new Date();
        const formattedDate = today.toLocaleDateString(undefined, options);
        currentDateEl.textContent = formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);
    }

    // Enlace del botón de configuración del encabezado hacia la sección de pruebas/configuración
    const btnConfigHeader = document.getElementById('btnConfigHeader');
    if (btnConfigHeader) {
        btnConfigHeader.addEventListener('click', () => {
            const configSection = document.getElementById('configuracion');
            if (configSection) {
                configSection.scrollIntoView({ behavior: 'smooth' });
            }
        });
    }

    // 2. Menú lateral de escritorio (Expandir / Contraer) con ARIA
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebarToggle');
    const appLayout = document.getElementById('appLayout');

    if (sidebarToggle && sidebar && appLayout) {
        sidebarToggle.addEventListener('click', () => {
            const isCollapsed = sidebar.classList.toggle('collapsed');
            appLayout.classList.toggle('sidebar-collapsed', isCollapsed);

            // Actualización de atributos de accesibilidad
            sidebarToggle.setAttribute('aria-expanded', !isCollapsed);
            sidebarToggle.setAttribute('aria-label', isCollapsed ? 'Expandir menú de escritorio' : 'Contraer menú de escritorio');
            sidebarToggle.textContent = isCollapsed ? '▶' : '◀';
        });
    }

    // 3 & 4 & 5 & 6. Menú móvil con gestión de inert y retorno de foco
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

    // Inicializar estado inert en carga móvil
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

    // Tecla Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (sidebar && sidebar.classList.contains('mobile-open')) {
                closeMobileMenu(true);
            }
        }
    });

    // Enlaces de navegación: cerrar menú sin forzar foco al botón (returnFocus = false)
    const navLinks = document.querySelectorAll('.sidebar-nav a');
    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            if (window.innerWidth <= 768) {
                closeMobileMenu(false);
            }
        });
    });

    // Listener de redimensionamiento de ventana (window.resize)
    window.addEventListener('resize', () => {
        if (window.innerWidth > 768) {
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
        } else {
            // Al volver a 768px o menos, mantenerlo cerrado inicialmente aplicando inert
            updateMobileInert();
        }
    });
});