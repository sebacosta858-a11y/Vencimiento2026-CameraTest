const secureStatus = document.getElementById('secureStatus');
const apiStatus = document.getElementById('apiStatus');
const btnStart = document.getElementById('btnStart');
const btnStop = document.getElementById('btnStop');
const videoElement = document.getElementById('videoElement');
const videoPlaceholder = document.getElementById('videoPlaceholder');
const logArea = document.getElementById('logArea');
const readerState = document.getElementById('readerState');
const barcodeValue = document.getElementById('barcodeValue');
const barcodeFormat = document.getElementById('barcodeFormat');

let currentStream = null;
let isRequesting = false;
let activeRequestId = 0;
let scannerControls = null;
let lastScannedCode = null;

// Verificación de contexto seguro y soporte de la API
const isSecure = window.isSecureContext;
secureStatus.textContent = isSecure ? 'Sí' : 'No';
secureStatus.className = `badge ${isSecure}`;

const hasGetUserMedia = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
apiStatus.textContent = hasGetUserMedia ? 'Disponible' : 'No disponible';
apiStatus.className = `badge ${hasGetUserMedia}`;

function log(message, isError = false) {
    const timestamp = new Date().toLocaleTimeString();
    logArea.textContent = `[${timestamp}] ${message}\n` + logArea.textContent;
    console.log(message);
}

function handleCameraError(error) {
    let userMessage = '';
    const errorName = error.name || 'UnknownError';

    switch (errorName) {
        case 'NotAllowedError':
        case 'PermissionDeniedError':
            userMessage = 'Permiso denegado. Debes autorizar el acceso a la cámara en los ajustes.';
            break;
        case 'NotFoundError':
        case 'DevicesNotFoundError':
            userMessage = 'No se encontró ninguna cámara trasera compatible en el dispositivo.';
            break;
        case 'NotReadableError':
        case 'TrackStartError':
            userMessage = 'La cámara está siendo utilizada por otra aplicación o hay un bloqueo de hardware.';
            break;
        case 'OverconstrainedError':
        case 'ConstraintNotSatisfiedError':
            userMessage = 'No se pudo aplicar la restricción exacta (facingMode: environment).';
            break;
        case 'SecurityError':
            userMessage = 'Error de seguridad. La API requiere un contexto seguro (HTTPS o localhost).';
            break;
        case 'AbortError':
            userMessage = 'La solicitud de la cámara fue abortada por interrupción del sistema.';
            break;
        default:
            userMessage = `Error imprevisto (${errorName}): ${error.message || 'Sin descripción'}`;
            break;
    }

    log(`Error: ${userMessage}`, true);
}

// Liberación de pistas individuales del MediaStream
function stopStreamTracks(streamToStop) {
    if (!streamToStop) return;

    streamToStop.getTracks().forEach(track => {
        track.onended = null;
        track.stop();
    });
}

// Función centralizada para detener la cámara y el lector de ZXing de la sesión activa
function stopCamera(reasonMessage) {
    activeRequestId++;

    if (scannerControls) {
        try {
            scannerControls.stop();
        } catch (e) {
            // Silenciar errores menores si ya estaba detenido
        }

        scannerControls = null;
    }

    if (currentStream) {
        stopStreamTracks(currentStream);
        currentStream = null;
    }

    videoElement.pause();
    videoElement.srcObject = null;
    videoElement.style.display = 'none';
    videoPlaceholder.style.display = 'block';

    isRequesting = false;
    btnStart.disabled = false;
    btnStop.disabled = true;
    readerState.textContent = 'Inactivo';
    readerState.style.color = '';

    if (reasonMessage) {
        log(reasonMessage);
    }
}

async function startCamera() {
    if (isRequesting || currentStream) return;

    if (!window.isSecureContext) {
        log('Error de seguridad: La API de la cámara requiere un contexto seguro (HTTPS o localhost).', true);
        return;
    }

    if (!hasGetUserMedia) {
        log('El navegador no soporta la API getUserMedia.', true);
        return;
    }

    // Comprobación de disponibilidad de ZXing Browser
    if (
        typeof ZXingBrowser === 'undefined' ||
        !ZXingBrowser.BrowserMultiFormatOneDReader ||
        !ZXingBrowser.BarcodeFormat
    ) {
        log('Error: La biblioteca ZXing (@zxing/browser) no está disponible o no es compatible.', true);
        readerState.textContent = 'No disponible';
        return;
    }

    isRequesting = true;
    btnStart.disabled = true;
    btnStop.disabled = true;

    const currentRequestId = ++activeRequestId;
    log('Solicitando acceso a la cámara trasera y preparando lector...');

    const constraints = {
        video: {
            facingMode: { ideal: "environment" }
        },
        audio: false
    };

    try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);

        // Comprobación de concurrencia: si se invalidó durante getUserMedia
        if (currentRequestId !== activeRequestId) {
            log('Solicitud invalidada antes de reproducir. Liberando stream local...');
            stopStreamTracks(stream);
            return;
        }

        currentStream = stream;

        currentStream.getTracks().forEach(track => {
            track.onended = () => {
                if (currentStream === stream) {
                    log('Transmisión de cámara finalizada por el sistema operativo o interrupción externa.');
                    stopCamera();
                }
            };
        });

        videoElement.srcObject = currentStream;
        await videoElement.play();

        // Comprobación de concurrencia: si se invalidó durante video.play()
        if (currentRequestId !== activeRequestId) {
            log('Solicitud cancelada durante la reproducción. Liberando stream local...');
            stopStreamTracks(stream);

            if (videoElement.srcObject === stream) {
                videoElement.pause();
                videoElement.srcObject = null;
                videoElement.style.display = 'none';
                videoPlaceholder.style.display = 'block';
            }

            return;
        }

        videoElement.style.display = 'block';
        videoPlaceholder.style.display = 'none';

        btnStart.disabled = true;
        btnStop.disabled = false;

        log('¡Cámara abierta y transmitiendo con éxito!');

        // Inicializar ZXing utilizando BrowserMultiFormatOneDReader
        const codeReader = new ZXingBrowser.BrowserMultiFormatOneDReader();

        readerState.textContent = 'Escaneando...';
        readerState.style.color =
            getComputedStyle(document.documentElement).getPropertyValue('--success').trim() || '#16a34a';

        log('Lector ZXing 1D iniciado (EAN-13, EAN-8).');

        // decodeFromVideoElement devuelve una promesa que resuelve en IScannerControls
        const controls = await codeReader.decodeFromVideoElement(videoElement, (result, error) => {
            if (currentRequestId !== activeRequestId) return;

            if (result) {
                const format = result.getBarcodeFormat();
                const EAN_13 = ZXingBrowser.BarcodeFormat.EAN_13;
                const EAN_8 = ZXingBrowser.BarcodeFormat.EAN_8;

                // Filtrar y aceptar exclusivamente resultados EAN_13 o EAN_8
                if (format === EAN_13 || format === EAN_8) {
                    const text = result.getText();
                    const formatName = format === EAN_13 ? 'EAN_13' : 'EAN_8';

                    if (text !== lastScannedCode) {
                        lastScannedCode = text;
                        barcodeValue.textContent = text;
                        barcodeFormat.textContent = formatName;
                        log(`Código detectado [${formatName}]: ${text}`);
                    }
                }
            }
        });

        // Verificación de concurrencia post-resolución del lector
        if (currentRequestId !== activeRequestId) {
            log('Solicitud invalidada tras iniciar el lector. Deteniendo controles locales...');

            if (controls) {
                controls.stop();
            }

            stopStreamTracks(stream);
            return;
        }

        // Asignar controles exclusivamente a la sesión activa actual
        scannerControls = controls;

    } catch (error) {
        if (currentRequestId === activeRequestId) {
            handleCameraError(error);
            stopCamera();
        } else {
            log('Error en solicitud invalidada omitido.');
        }
    } finally {
        if (currentRequestId === activeRequestId) {
            isRequesting = false;
        }
    }
}

btnStart.addEventListener('click', () => {
    lastScannedCode = null;
    barcodeValue.textContent = '-';
    barcodeFormat.textContent = '-';
    startCamera();
});

btnStop.addEventListener('click', () => {
    stopCamera('Cámara cerrada y recursos liberados correctamente.');
});

// Manejo de ciclo de vida de la página (segundo plano / ocultar)
function handleLifecycleInvalidation() {
    if (currentStream || isRequesting || scannerControls) {
        stopCamera('Página ocultada o en segundo plano. Recursos y lector liberados.');
    }
}

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        handleLifecycleInvalidation();
    }
});

window.addEventListener('pagehide', handleLifecycleInvalidation);