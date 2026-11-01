/**
 * Vencimiento2026 — Módulo de Inventario y Reglas de Negocio (js/inventory.js)
 * Única fuente de verdad para operaciones sobre el almacén inventoryRecords en IndexedDB.
 */

// Constantes de validación de negocio
const ALLOWED_SECTORS = ['PFT', 'PGC_DPH'];
const ALLOWED_UNITS = ['Unidades', 'KG'];

/**
 * Comprueba si un valor es un objeto plano cuyo prototipo sea Object.prototype o null.
 * Rechaza null, arrays, Date, Map, Set, clases personalizadas y cualquier otro prototipo.
 * @param {*} value
 * @returns {boolean}
 */
function isPlainObject(value) {
    if (value === null || typeof value !== 'object') return false;
    const proto = Object.getPrototypeOf(value);
    return proto === null || proto === Object.prototype;
}

/**
 * Valida si el sector es permitido.
 * @param {string} sector
 * @returns {boolean}
 */
function validateSector(sector) {
    return ALLOWED_SECTORS.includes(sector);
}

/**
 * Valida si la unidad es permitida.
 * @param {string} unit
 * @returns {boolean}
 */
function validateUnit(unit) {
    return ALLOWED_UNITS.includes(unit);
}

/**
 * Valida de forma estricta el formato YYYY-MM-DD y la existencia real de la fecha en el calendario,
 * contemplando años bisiestos y evitando la normalización automática de JavaScript.
 * @param {string} dateStr
 * @returns {boolean}
 */
function validateDate(dateStr) {
    if (typeof dateStr !== 'string') return false;

    const regex = /^(\d{4})-(\d{2})-(\d{2})$/;
    const match = dateStr.match(regex);

    if (!match) return false;

    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const day = parseInt(match[3], 10);

    if (month < 1 || month > 12) return false;

    const daysInMonths = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const isLeap = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);

    if (isLeap) {
        daysInMonths[2] = 29;
    }

    if (day < 1 || day > daysInMonths[month]) return false;

    return true;
}

/**
 * Valida que la cantidad sea un entero positivo seguro.
 * @param {number} qty
 * @returns {boolean}
 */
function validateQuantity(qty) {
    return Number.isSafeInteger(qty) && qty > 0;
}

/**
 * Valida de forma estricta que el EAN sea exclusivamente un string no vacío después de trim().
 * No acepta null, undefined, números, booleanos, objetos ni strings vacíos.
 * @param {*} ean
 * @returns {boolean}
 */
function validateEan(ean) {
    if (typeof ean !== 'string') return false;

    const trimmed = ean.trim();

    return trimmed.length > 0;
}

/**
 * Valida que la descripción sea un string no vacío después de trim().
 * @param {*} desc
 * @returns {boolean}
 */
function validateDescription(desc) {
    if (typeof desc !== 'string') return false;

    return desc.trim().length > 0;
}

/**
 * Valida estrictamente valores booleanos reales (true o false).
 * @param {*} val
 * @param {boolean} defaultValue
 * @returns {Object} { valid: boolean, value: boolean }
 */
function validateBoolean(val, defaultValue = false) {
    if (val === undefined) return { valid: true, value: defaultValue };

    if (typeof val === 'boolean') {
        return { valid: true, value: val };
    }

    return { valid: false };
}

/**
 * Crea un nuevo registro de inventario validando reglas de negocio y duplicados.
 * Clave de duplicado: EAN + Fecha de Vencimiento + Sector + Unidad.
 *
 * @param {Object} record
 * @returns {Promise<Object>} Resultado estructurado { success, duplicate, message, error }
 */
export async function createInventoryRecord(record) {
    if (!isPlainObject(record)) {
        return { success: false, error: 'Registro inválido.' };
    }

    const {
        ean,
        description,
        expirationDate,
        quantity,
        unit,
        sector,
        ownBrand,
        returnable
    } = record;

    if (!validateEan(ean)) {
        return {
            success: false,
            error: 'EAN inválido (debe ser estrictamente una cadena de texto no vacía).'
        };
    }

    if (!validateDescription(description)) {
        return { success: false, error: 'Descripción inválida o faltante.' };
    }

    if (!validateDate(expirationDate)) {
        return {
            success: false,
            error: 'Fecha de vencimiento inválida o inexistente en el calendario.'
        };
    }

    if (!validateQuantity(quantity)) {
        return {
            success: false,
            error: 'Cantidad inválida (debe ser un entero positivo seguro).'
        };
    }

    if (!validateUnit(unit)) {
        return {
            success: false,
            error: 'Unidad no permitida (debe ser "Unidades" o "KG").'
        };
    }

    if (!validateSector(sector)) {
        return {
            success: false,
            error: 'Sector no permitido (debe ser "PFT" o "PGC_DPH").'
        };
    }

    const ownBrandValidation = validateBoolean(ownBrand, false);

    if (!ownBrandValidation.valid) {
        return {
            success: false,
            error: 'El campo ownBrand debe ser estrictamente un valor booleano.'
        };
    }

    const returnableValidation = validateBoolean(returnable, false);

    if (!returnableValidation.valid) {
        return {
            success: false,
            error: 'El campo returnable debe ser estrictamente un valor booleano.'
        };
    }

    const db = await window.getDatabaseConnection();

    return new Promise((resolve) => {
        let settled = false;
        let abortRequested = false;
        let pendingResult = null;

        const transaction = db.transaction(['inventoryRecords'], 'readwrite');
        const store = transaction.objectStore('inventoryRecords');
        const index = store.index('ean_exp_sector_unit');

        transaction.oncomplete = () => {
            if (settled) return;

            settled = true;

            resolve({
                success: true,
                duplicate: false,
                message: 'Registro creado exitosamente.'
            });
        };

        transaction.onabort = () => {
            if (settled) return;

            settled = true;

            resolve(
                pendingResult || {
                    success: false,
                    error: transaction.error
                        ? transaction.error.message
                        : 'La transacción fue abortada.'
                }
            );
        };

        transaction.onerror = () => {
            if (settled) return;

            if (!pendingResult && transaction.error) {
                pendingResult = {
                    success: false,
                    error: transaction.error.message
                };
            }
        };

        const duplicateKey = [ean.trim(), expirationDate, sector, unit];
        const request = index.getKey(duplicateKey);

        request.onsuccess = () => {
            if (abortRequested || settled) return;

            if (request.result !== undefined) {
                abortRequested = true;

                pendingResult = {
                    success: false,
                    duplicate: true,
                    message: 'Ya existe un registro con la misma clave de duplicado.'
                };

                transaction.abort();
                return;
            }

            const now = Date.now();

            const generatedId = (
                typeof crypto !== 'undefined' &&
                typeof crypto.randomUUID === 'function'
            )
                ? crypto.randomUUID()
                : (
                    Date.now().toString() +
                    '-' +
                    Math.random().toString(36).substr(2, 9)
                );

            const newRecord = {
                id: generatedId,
                ean: ean.trim(),
                description: description.trim(),
                expirationDate,
                quantity,
                unit,
                sector,
                ownBrand: ownBrandValidation.value,
                returnable: returnableValidation.value,
                createdAt: now,
                updatedAt: now
            };

            const addRequest = store.add(newRecord);

            addRequest.onerror = (e) => {
                if (abortRequested || settled) return;

                abortRequested = true;

                pendingResult = {
                    success: false,
                    error: e.target.error
                        ? e.target.error.message
                        : 'Error al añadir el registro.'
                };

                transaction.abort();
            };
        };

        request.onerror = (e) => {
            if (abortRequested || settled) return;

            abortRequested = true;

            pendingResult = {
                success: false,
                error: e.target.error
                    ? e.target.error.message
                    : 'Error en la verificación de duplicados.'
            };

            transaction.abort();
        };
    });
}

/**
 * Devuelve registros del inventario aplicando filtros opcionales validados estrictamente.
 *
 * Filtros admitidos:
 * ean, sector, unit, expirationDate, ownBrand y returnable.
 *
 * @param {Object} filters
 * @returns {Promise<Array>}
 */
export async function getInventoryRecords(filters = {}) {
    if (filters === undefined) {
        filters = {};
    }

    if (!isPlainObject(filters)) {
        throw new Error('Filtros inválidos: deben ser un objeto plano.');
    }

    const allowedFilterKeys = [
        'ean',
        'sector',
        'unit',
        'expirationDate',
        'ownBrand',
        'returnable'
    ];

    const filterKeys = Object.keys(filters);

    for (const key of filterKeys) {
        if (!allowedFilterKeys.includes(key)) {
            throw new Error(`Filtro no reconocido o no permitido: '${key}'.`);
        }
    }

    if (filters.ean !== undefined) {
        if (!validateEan(filters.ean)) {
            throw new Error('Filtro EAN inválido (debe ser string no vacío).');
        }
    }

    if (filters.sector !== undefined) {
        if (!validateSector(filters.sector)) {
            throw new Error('Filtro sector inválido (debe ser "PFT" o "PGC_DPH").');
        }
    }

    if (filters.unit !== undefined) {
        if (!validateUnit(filters.unit)) {
            throw new Error('Filtro unit inválido (debe ser "Unidades" o "KG").');
        }
    }

    if (filters.expirationDate !== undefined) {
        if (!validateDate(filters.expirationDate)) {
            throw new Error(
                'Filtro expirationDate inválido (formato YYYY-MM-DD real requerido).'
            );
        }
    }

    if (filters.ownBrand !== undefined && typeof filters.ownBrand !== 'boolean') {
        throw new Error('Filtro ownBrand inválido (debe ser un valor booleano real).');
    }

    if (filters.returnable !== undefined && typeof filters.returnable !== 'boolean') {
        throw new Error('Filtro returnable inválido (debe ser un valor booleano real).');
    }

    const db = await window.getDatabaseConnection();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['inventoryRecords'], 'readonly');
        const store = transaction.objectStore('inventoryRecords');

        let request;

        // Selecciona el índice más apropiado para iniciar la consulta.
        if (filters.ean !== undefined) {
            const index = store.index('ean');
            request = index.getAll(filters.ean.trim());
        } else if (filters.sector !== undefined) {
            const index = store.index('sector');
            request = index.getAll(filters.sector);
        } else if (filters.expirationDate !== undefined) {
            const index = store.index('expirationDate');
            request = index.getAll(filters.expirationDate);
        } else {
            request = store.getAll();
        }

        request.onsuccess = () => {
            let results = request.result || [];

            // Aplica todos los filtros, incluidos los que no tienen índice propio.
            results = results.filter(record => {
                if (
                    filters.ean !== undefined &&
                    record.ean !== filters.ean.trim()
                ) {
                    return false;
                }

                if (
                    filters.sector !== undefined &&
                    record.sector !== filters.sector
                ) {
                    return false;
                }

                if (
                    filters.expirationDate !== undefined &&
                    record.expirationDate !== filters.expirationDate
                ) {
                    return false;
                }

                if (
                    filters.unit !== undefined &&
                    record.unit !== filters.unit
                ) {
                    return false;
                }

                if (
                    filters.ownBrand !== undefined &&
                    record.ownBrand !== filters.ownBrand
                ) {
                    return false;
                }

                if (
                    filters.returnable !== undefined &&
                    record.returnable !== filters.returnable
                ) {
                    return false;
                }

                return true;
            });

            resolve(results);
        };

        request.onerror = (e) => {
            reject(
                e.target.error ||
                new Error('Error al consultar los registros.')
            );
        };
    });
}

/**
 * Busca y devuelve un registro por su ID único validando el parámetro.
 *
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
export async function getInventoryRecordById(id) {
    if (!id || typeof id !== 'string' || id.trim() === '') {
        return null;
    }

    const db = await window.getDatabaseConnection();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['inventoryRecords'], 'readonly');
        const store = transaction.objectStore('inventoryRecords');
        const request = store.get(id.trim());

        request.onsuccess = () => {
            resolve(request.result !== undefined ? request.result : null);
        };

        request.onerror = (e) => {
            reject(
                e.target.error ||
                new Error('Error al buscar registro por ID.')
            );
        };
    });
}

/**
 * Devuelve todos los registros correspondientes al EAN indicado validando estrictamente el parámetro.
 *
 * @param {string} ean
 * @returns {Promise<Array>}
 */
export async function getInventoryRecordsByEan(ean) {
    if (!validateEan(ean)) {
        return [];
    }

    const db = await window.getDatabaseConnection();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['inventoryRecords'], 'readonly');
        const store = transaction.objectStore('inventoryRecords');
        const index = store.index('ean');
        const request = index.getAll(ean.trim());

        request.onsuccess = () => {
            resolve(request.result || []);
        };

        request.onerror = (e) => {
            reject(
                e.target.error ||
                new Error('Error al buscar registros por EAN.')
            );
        };
    });
}

/**
 * Actualiza un registro existente aplicando lista blanca estricta, validación completa del registro
 * resultante y prevención de duplicados.
 *
 * @param {string} id
 * @param {Object} changes
 * @returns {Promise<Object>}
 */
export async function updateInventoryRecord(id, changes) {
    if (!id || typeof id !== 'string' || id.trim() === '') {
        return {
            success: false,
            error: 'ID de registro requerido y válido.'
        };
    }

    if (!isPlainObject(changes)) {
        return {
            success: false,
            error: 'Cambios inválidos.'
        };
    }

    const allowedKeys = [
        'ean',
        'description',
        'expirationDate',
        'quantity',
        'unit',
        'sector',
        'ownBrand',
        'returnable'
    ];

    const changeKeys = Object.keys(changes);

    for (const key of changeKeys) {
        if (['id', 'createdAt', 'updatedAt'].includes(key)) {
            return {
                success: false,
                error: `No se permite modificar el campo protegido '${key}'.`
            };
        }

        if (!allowedKeys.includes(key)) {
            return {
                success: false,
                error: `Propiedad no permitida en la actualización: '${key}'.`
            };
        }
    }

    const db = await window.getDatabaseConnection();

    return new Promise((resolve) => {
        let settled = false;
        let abortRequested = false;
        let pendingResult = null;

        const transaction = db.transaction(['inventoryRecords'], 'readwrite');
        const store = transaction.objectStore('inventoryRecords');

        transaction.oncomplete = () => {
            if (settled) return;

            settled = true;

            resolve({
                success: true,
                message: 'Registro actualizado exitosamente.'
            });
        };

        transaction.onabort = () => {
            if (settled) return;

            settled = true;

            resolve(
                pendingResult || {
                    success: false,
                    error: transaction.error
                        ? transaction.error.message
                        : 'La transacción fue abortada.'
                }
            );
        };

        transaction.onerror = () => {
            if (settled) return;

            if (!pendingResult && transaction.error) {
                pendingResult = {
                    success: false,
                    error: transaction.error.message
                };
            }
        };

        const getRequest = store.get(id.trim());

        getRequest.onsuccess = () => {
            if (abortRequested || settled) return;

            const existingRecord = getRequest.result;

            if (!existingRecord) {
                abortRequested = true;
                pendingResult = {
                    success: false,
                    error: 'Registro no encontrado.'
                };

                transaction.abort();
                return;
            }

            const mergedEan = changes.ean !== undefined
                ? changes.ean
                : existingRecord.ean;

            const mergedDescription = changes.description !== undefined
                ? changes.description
                : existingRecord.description;

            const mergedExpirationDate = changes.expirationDate !== undefined
                ? changes.expirationDate
                : existingRecord.expirationDate;

            const mergedQuantity = changes.quantity !== undefined
                ? changes.quantity
                : existingRecord.quantity;

            const mergedUnit = changes.unit !== undefined
                ? changes.unit
                : existingRecord.unit;

            const mergedSector = changes.sector !== undefined
                ? changes.sector
                : existingRecord.sector;

            // Validación estricta obligatoria de booleanos.
            const mergedOwnBrand = changes.ownBrand !== undefined
                ? changes.ownBrand
                : existingRecord.ownBrand;

            const obVal = validateBoolean(mergedOwnBrand);

            if (!obVal.valid) {
                abortRequested = true;

                pendingResult = {
                    success: false,
                    error: 'El campo ownBrand debe ser estrictamente un valor booleano.'
                };

                transaction.abort();
                return;
            }

            const updatedOwnBrand = obVal.value;

            const mergedReturnable = changes.returnable !== undefined
                ? changes.returnable
                : existingRecord.returnable;

            const retVal = validateBoolean(mergedReturnable);

            if (!retVal.valid) {
                abortRequested = true;

                pendingResult = {
                    success: false,
                    error: 'El campo returnable debe ser estrictamente un valor booleano.'
                };

                transaction.abort();
                return;
            }

            const updatedReturnable = retVal.value;

            // Validación completa del registro resultante antes de persistir.
            if (!validateEan(mergedEan)) {
                abortRequested = true;

                pendingResult = {
                    success: false,
                    error: 'EAN inválido (debe ser estrictamente una cadena de texto no vacía).'
                };

                transaction.abort();
                return;
            }

            if (!validateDescription(mergedDescription)) {
                abortRequested = true;

                pendingResult = {
                    success: false,
                    error: 'Descripción inválida o faltante.'
                };

                transaction.abort();
                return;
            }

            if (!validateDate(mergedExpirationDate)) {
                abortRequested = true;

                pendingResult = {
                    success: false,
                    error: 'Fecha de vencimiento inválida o inexistente en el calendario.'
                };

                transaction.abort();
                return;
            }

            if (!validateQuantity(mergedQuantity)) {
                abortRequested = true;

                pendingResult = {
                    success: false,
                    error: 'Cantidad inválida (debe ser un entero positivo seguro).'
                };

                transaction.abort();
                return;
            }

            if (!validateUnit(mergedUnit)) {
                abortRequested = true;

                pendingResult = {
                    success: false,
                    error: 'Unidad no permitida (debe ser "Unidades" o "KG").'
                };

                transaction.abort();
                return;
            }

            if (!validateSector(mergedSector)) {
                abortRequested = true;

                pendingResult = {
                    success: false,
                    error: 'Sector no permitido (debe ser "PFT" o "PGC_DPH").'
                };

                transaction.abort();
                return;
            }

            const updatedEan = mergedEan.trim();
            const updatedDescription = mergedDescription.trim();

            const keyChanged = (
                updatedEan !== existingRecord.ean ||
                mergedExpirationDate !== existingRecord.expirationDate ||
                mergedSector !== existingRecord.sector ||
                mergedUnit !== existingRecord.unit
            );

            const performUpdate = () => {
                if (abortRequested || settled) return;

                const updatedRecord = {
                    ...existingRecord,
                    ean: updatedEan,
                    description: updatedDescription,
                    expirationDate: mergedExpirationDate,
                    quantity: mergedQuantity,
                    unit: mergedUnit,
                    sector: mergedSector,
                    ownBrand: updatedOwnBrand,
                    returnable: updatedReturnable,
                    id: existingRecord.id,
                    createdAt: existingRecord.createdAt,
                    updatedAt: Date.now()
                };

                const putRequest = store.put(updatedRecord);

                putRequest.onerror = (e) => {
                    if (abortRequested || settled) return;

                    abortRequested = true;

                    pendingResult = {
                        success: false,
                        error: e.target.error
                            ? e.target.error.message
                            : 'Error al actualizar el registro.'
                    };

                    transaction.abort();
                };
            };

            if (keyChanged) {
                const index = store.index('ean_exp_sector_unit');

                const duplicateKey = [
                    updatedEan,
                    mergedExpirationDate,
                    mergedSector,
                    mergedUnit
                ];

                const dupRequest = index.getKey(duplicateKey);

                dupRequest.onsuccess = () => {
                    if (abortRequested || settled) return;

                    const foundId = dupRequest.result;

                    if (foundId !== undefined && foundId !== id.trim()) {
                        abortRequested = true;

                        pendingResult = {
                            success: false,
                            duplicate: true,
                            error: 'La actualización generaría un registro duplicado.'
                        };

                        transaction.abort();
                        return;
                    }

                    performUpdate();
                };

                dupRequest.onerror = (e) => {
                    if (abortRequested || settled) return;

                    abortRequested = true;

                    pendingResult = {
                        success: false,
                        error: e.target.error
                            ? e.target.error.message
                            : 'Error en la verificación de duplicados.'
                    };

                    transaction.abort();
                };
            } else {
                performUpdate();
            }
        };

        getRequest.onerror = (e) => {
            if (abortRequested || settled) return;

            abortRequested = true;

            pendingResult = {
                success: false,
                error: e.target.error
                    ? e.target.error.message
                    : 'Error al obtener el registro.'
            };

            transaction.abort();
        };
    });
}

/**
 * Elimina un registro del inventario por su ID.
 *
 * @param {string} id
 * @returns {Promise<Object>}
 */
export async function deleteInventoryRecord(id) {
    if (!id || typeof id !== 'string' || id.trim() === '') {
        return {
            success: false,
            error: 'ID de registro requerido y válido.'
        };
    }

    const db = await window.getDatabaseConnection();

    return new Promise((resolve) => {
        let settled = false;
        let abortRequested = false;
        let pendingResult = null;

        const transaction = db.transaction(['inventoryRecords'], 'readwrite');
        const store = transaction.objectStore('inventoryRecords');

        transaction.oncomplete = () => {
            if (settled) return;

            settled = true;

            resolve({
                success: true,
                message: 'Registro eliminado exitosamente.'
            });
        };

        transaction.onabort = () => {
            if (settled) return;

            settled = true;

            resolve(
                pendingResult || {
                    success: false,
                    error: transaction.error
                        ? transaction.error.message
                        : 'La transacción fue abortada.'
                }
            );
        };

        transaction.onerror = () => {
            if (settled) return;

            if (!pendingResult && transaction.error) {
                pendingResult = {
                    success: false,
                    error: transaction.error.message
                };
            }
        };

        const getRequest = store.get(id.trim());

        getRequest.onsuccess = () => {
            if (abortRequested || settled) return;

            if (!getRequest.result) {
                abortRequested = true;

                pendingResult = {
                    success: false,
                    error: 'Registro no encontrado.'
                };

                transaction.abort();
                return;
            }

            const delRequest = store.delete(id.trim());

            delRequest.onerror = (e) => {
                if (abortRequested || settled) return;

                abortRequested = true;

                pendingResult = {
                    success: false,
                    error: e.target.error
                        ? e.target.error.message
                        : 'Error al eliminar el registro.'
                };

                transaction.abort();
            };
        };

        getRequest.onerror = (e) => {
            if (abortRequested || settled) return;

            abortRequested = true;

            pendingResult = {
                success: false,
                error: e.target.error
                    ? e.target.error.message
                    : 'Error al obtener el registro para eliminar.'
            };

            transaction.abort();
        };
    });
}

/**
 * Suma una cantidad entera positiva a un registro existente validando límites seguros de enteros.
 *
 * @param {string} id
 * @param {number} quantity
 * @returns {Promise<Object>}
 */
export async function addQuantityToInventoryRecord(id, quantity) {
    if (!id || typeof id !== 'string' || id.trim() === '') {
        return {
            success: false,
            error: 'ID de registro requerido y válido.'
        };
    }

    if (!validateQuantity(quantity)) {
        return {
            success: false,
            error: 'Cantidad a sumar inválida (debe ser un entero positivo seguro).'
        };
    }

    const db = await window.getDatabaseConnection();

    return new Promise((resolve) => {
        let settled = false;
        let abortRequested = false;
        let pendingResult = null;

        const transaction = db.transaction(['inventoryRecords'], 'readwrite');
        const store = transaction.objectStore('inventoryRecords');

        transaction.oncomplete = () => {
            if (settled) return;

            settled = true;

            resolve({
                success: true,
                message: 'Cantidad sumada exitosamente.'
            });
        };

        transaction.onabort = () => {
            if (settled) return;

            settled = true;

            resolve(
                pendingResult || {
                    success: false,
                    error: transaction.error
                        ? transaction.error.message
                        : 'La transacción fue abortada.'
                }
            );
        };

        transaction.onerror = () => {
            if (settled) return;

            if (!pendingResult && transaction.error) {
                pendingResult = {
                    success: false,
                    error: transaction.error.message
                };
            }
        };

        const getRequest = store.get(id.trim());

        getRequest.onsuccess = () => {
            if (abortRequested || settled) return;

            const record = getRequest.result;

            if (!record) {
                abortRequested = true;

                pendingResult = {
                    success: false,
                    error: 'Registro no encontrado.'
                };

                transaction.abort();
                return;
            }

            if (!validateQuantity(record.quantity)) {
                abortRequested = true;

                pendingResult = {
                    success: false,
                    error: 'La cantidad actual almacenada no es un entero positivo seguro.'
                };

                transaction.abort();
                return;
            }

            const newQuantity = record.quantity + quantity;

            if (
                !Number.isSafeInteger(newQuantity) ||
                newQuantity > Number.MAX_SAFE_INTEGER
            ) {
                abortRequested = true;

                pendingResult = {
                    success: false,
                    error: 'La cantidad resultante excede el límite de enteros seguros.'
                };

                transaction.abort();
                return;
            }

            record.quantity = newQuantity;
            record.updatedAt = Date.now();

            const putRequest = store.put(record);

            putRequest.onerror = (e) => {
                if (abortRequested || settled) return;

                abortRequested = true;

                pendingResult = {
                    success: false,
                    error: e.target.error
                        ? e.target.error.message
                        : 'Error al actualizar la cantidad.'
                };

                transaction.abort();
            };
        };

        getRequest.onerror = (e) => {
            if (abortRequested || settled) return;

            abortRequested = true;

            pendingResult = {
                success: false,
                error: e.target.error
                    ? e.target.error.message
                    : 'Error al obtener el registro.'
            };

            transaction.abort();
        };
    });
}