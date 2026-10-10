# Huellas del Valle — Sistema de agendamiento de citas

Interfaz propia (HTML, CSS y JavaScript, sin frameworks) para la Clínica Veterinaria Huellas del Valle S.A.S.
Es el disparador del **Escenario 1** de Make: el formulario envía la solicitud al webhook y muestra lo que el proceso respondió.

## Vistas

| Vista | Qué hace |
|---|---|
| **Agendar cita** | Formulario con los 7 campos de la solicitud (`propietario`, `correo`, `mascota`, `especie`, `servicio`, `fecha`, `hora`). Valida los datos, dispara el webhook del Escenario 1 y muestra el resultado: confirmada, confirmada con alerta, rechazada o franja no disponible (respaldo). |
| **Agenda del día** | Lee la hoja de Google que usa Make y muestra las citas de una fecha con su estado, además de las franjas con sus cupos. |

La página **no decide** si hay cupo: esa lógica (`libres = cupo − ocupados` y el enrutamiento) vive en el Escenario 1.

## Archivos

| Archivo | Contenido |
|---|---|
| `index.html` | Estructura de las dos vistas |
| `styles.css` | Estilos, responsive para celular |
| `app.js` | Validación, envío al webhook, lectura de la hoja, historial |
| `config.js` | **Único archivo que se edita**: URL del webhook e ID de la hoja |

## Configuración

1. En `config.js`, pega:
   - `WEBHOOK_URL`: la dirección del módulo *Custom webhook* del Escenario 1.
   - `SHEET_ID`: el ID de la hoja de Google (en su URL, entre `/d/` y `/edit`).
2. Comparte la hoja con *Cualquier persona con el enlace → Lector* para que la vista de agenda pueda leerla. La página la lee con JSONP de Google Visualization (una etiqueta `<script>`), por lo que funciona igual abriendo el archivo local que publicada en GitHub Pages.
3. Las pestañas de la hoja deben llamarse `agenda` y `citas` (o cambia los nombres en `config.js`).

## Contrato con Make

**Lo que envía la página** (POST, `application/x-www-form-urlencoded`):

```
propietario=…&correo=…&mascota=…&especie=perro|gato&servicio=…&fecha=AAAA-MM-DD&hora=HH:MM
```

Se envía como formulario y no como JSON para que el navegador haga una petición simple, sin preflight CORS. Make convierte el formulario en los mismos 7 campos.

**Lo que debe responder cada ruta** (módulo *Webhook response*, status 200):

```json
{ "resultado": "CONFIRMADA | CONFIRMADA_ALERTA | RECHAZADA | RESPALDO",
  "mensaje": "Texto para el usuario",
  "libres": 1,
  "id_cita": "CITA-…" }
```

Encabezados obligatorios en cada *Webhook response*:

- `Content-Type: application/json`
- `Access-Control-Allow-Origin: *` (sin este, el navegador bloquea la respuesta)

## Ejecutar en local

Abre `index.html` en el navegador (doble clic) o, desde la terminal:

```
python -m http.server 5500
```

## Publicación

GitHub Pages: *Settings → Pages → Deploy from a branch → main / (root)*.
