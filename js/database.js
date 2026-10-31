/**
 * Vencimiento2026 — Capa de Persistencia Local con IndexedDB (js/database.js)
 * Responsable de la inicialización, esquemas, manejo de versiones, migraciones y gestión de conexiones de la base de datos.
 */

const DB_NAME = 'Vencimiento2026DB';
const DB_VERSION = 1;

// Variables singleton para el manejo de instancias y control de concurrencia de apertura
let dbInstance = null;
let openPromise = null;

/**
 * Abre y devuelve la conexión a la base de datos IndexedDB. 
 * Si ya existe una conexión activa, la reutiliza. 
 * Si hay una apertura en curso, comparte la misma promesa para evitar múltiples llamadas concurrentes a indexedDB.open().
 * 
 * @returns {Promise<IDBDatabase>} Promesa que se resuelve con la instancia de la base de datos.
 */
export function openDatabase() {
    // Reutilizar conexión si ya está disponible en memoria
    if (dbInstance) {
        return Promise.resolve(dbInstance);
    }

    // Reutilizar la promesa de apertura si ya hay una solicitud en curso
    if (openPromise) {
        return openPromise;
    }

    openPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        // Manejo de errores globales de apertura
        request.onerror = (event) => {
            console.error('Error crítico al abrir Vencimiento2026DB:', event.target.error);
            openPromise = null; // Limpiar la promesa en curso para permitir nuevos intentos
            reject(event.target.error);
        };

        // Apertura exitosa de la base de datos
        request.onsuccess = (event) => {
            openPromise = null; // Limpiar la promesa de apertura al finalizar con éxito
            dbInstance = event.target.result;

            // Escuchar si la conexión se cierra de forma inesperada
            dbInstance.onclose = () => {
                dbInstance = null;
                openPromise = null;
                console.warn('La conexión a Vencimiento2026DB se ha cerrado inesperadamente.');
            };

            // GESTIÓN DE VERSIONCHANGE: Manejar solicitudes de actualización desde otras pestañas
            dbInstance.onversionchange = () => {
                console.warn('Otra pestaña solicitó una actualización de versión. Cerrando conexión local...');
                dbInstance.close();
                dbInstance = null;
                openPromise = null;
            };

            resolve(dbInstance);
        };

        // PREPARACIÓN PARA MIGRACIONES: Configuración y actualización de esquemas (Object Stores e Índices)
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            const transaction = event.target.transaction;
            console.log(`Actualizando esquema de base de datos a la versión ${event.newVersion}...`);

            // 1. Object Store: inventoryRecords
            let inventoryStore;
            if (!db.objectStoreNames.contains('inventoryRecords')) {
                inventoryStore = db.createObjectStore('inventoryRecords', { keyPath: 'id' });
            } else {
                inventoryStore = transaction.objectStore('inventoryRecords');
            }

            if (!inventoryStore.indexNames.contains('ean')) {
                inventoryStore.createIndex('ean', 'ean', { unique: false });
            }
            if (!inventoryStore.indexNames.contains('expirationDate')) {
                inventoryStore.createIndex('expirationDate', 'expirationDate', { unique: false });
            }
            if (!inventoryStore.indexNames.contains('sector')) {
                inventoryStore.createIndex('sector', 'sector', { unique: false });
            }
            if (!inventoryStore.indexNames.contains('ean_exp_sector_unit')) {
                // Índice compuesto único para evitar duplicados exactos
                inventoryStore.createIndex('ean_exp_sector_unit', ['ean', 'expirationDate', 'sector', 'unit'], { unique: true });
            }

            // 2. Object Store: importBatches
            let batchesStore;
            if (!db.objectStoreNames.contains('importBatches')) {
                batchesStore = db.createObjectStore('importBatches', { keyPath: 'id' });
            } else {
                batchesStore = transaction.objectStore('importBatches');
            }

            if (!batchesStore.indexNames.contains('createdAt')) {
                batchesStore.createIndex('createdAt', 'createdAt', { unique: false });
            }

            // 3. Object Store: importRows
            let rowsStore;
            if (!db.objectStoreNames.contains('importRows')) {
                rowsStore = db.createObjectStore('importRows', { keyPath: 'id' });
            } else {
                rowsStore = transaction.objectStore('importRows');
            }

            if (!rowsStore.indexNames.contains('batchId')) {
                rowsStore.createIndex('batchId', 'batchId', { unique: false });
            }
            if (!rowsStore.indexNames.contains('ean')) {
                rowsStore.createIndex('ean', 'ean', { unique: false });
            }
            if (!rowsStore.indexNames.contains('expirationDate')) {
                rowsStore.createIndex('expirationDate', 'expirationDate', { unique: false });
            }
        };

        // Manejo del evento onblocked
        request.onblocked = () => {
            console.warn('La actualización de la base de datos está bloqueada. Por favor, cierre otras pestañas abiertas de la aplicación.');
        };
    });

    return openPromise;
}

/**
 * Cierra de forma ordenada la conexión activa a la base de datos.
 */
export function closeDatabase() {
    if (dbInstance) {
        dbInstance.close();
        dbInstance = null;
        openPromise = null;
        console.log('Conexión a Vencimiento2026DB cerrada correctamente.');
    }
}

/**
 * Devuelve la conexión disponible, abriéndola de manera transparente si aún no se encuentra inicializada.
 * 
 * @returns {Promise<IDBDatabase>} Promesa que se resuelve con la conexión activa.
 */
export async function getDatabase() {
    if (!dbInstance) {
        return await openDatabase();
    }
    return dbInstance;
}