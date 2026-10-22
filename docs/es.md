# PhotoPrism

Su biblioteca de fotos [PhotoPrism](https://www.photoprism.app) en Gladys, a
través de su red local: el número de fotos, vídeos, álbumes, lugares y fotos
por revisar, la fecha y el lugar de la última foto añadida, escenas que
reaccionan cuando llegan fotos nuevas o crece un álbum, y acciones de escena
que inician una indexación o una importación, con un disparador al terminar.

La integración se ha probado con un servidor PhotoPrism real (la imagen Docker
oficial, versión 261007), todavía no en una instalación real de Gladys: sus
comentarios son bienvenidos en el
[foro de Gladys](https://community.gladysassistant.com) o en las
[issues](https://github.com/guim31/gladys-photoprism/issues).

## Lo que necesita

- Gladys Assistant 5.1.0 o posterior.
- Un servidor **PhotoPrism** accesible desde Gladys (misma red).
- Una **contraseña de aplicación** con acceso completo: en PhotoPrism,
  **Ajustes** → **Cuenta** → **Aplicaciones y dispositivos** → **Añadir**,
  alcance «acceso completo» (o en el servidor:
  `photoprism auth add -n Gladys -s "*" -e -1 admin`). La importación necesita
  acceso completo; para los contadores basta un alcance más reducido.
- Sin contraseñas de aplicación (servidores antiguos, autenticación de dos
  factores desactivada), también sirven el usuario y la contraseña de una
  cuenta **admin**.
- Un servidor en modo público (`PHOTOPRISM_AUTH_MODE=public`) no necesita
  ninguna de las dos.

## Configuración

1. Instale la integración desde el catálogo de Gladys.
2. En **Configuración**, introduzca la **Dirección del servidor** con su puerto
   (por ejemplo `http://192.168.1.20:2342`; tras un proxy inverso,
   `https://example.org/photos`) y la **contraseña de aplicación**. Deje el
   usuario vacío con una contraseña de aplicación.
3. Elija la **Actualización** (5 minutos por defecto) y el **Idioma de los
   nombres**, y guarde. **Probar la conexión** lee el servidor al momento.
4. En **Descubrimiento**, añada el dispositivo **PhotoPrism**.

## Dispositivos

Un dispositivo **PhotoPrism**, con estas funciones (solo lectura):

| Función             | Lo que muestra                                                           |
| ------------------- | ------------------------------------------------------------------------ |
| Fotos               | Fotos de la biblioteca (sin las archivadas)                              |
| Vídeos              | Vídeos de la biblioteca                                                  |
| Álbumes             | Álbumes creados por los usuarios                                         |
| Lugares             | Lugares de las fotos (requiere la geocodificación de PhotoPrism)         |
| Por revisar         | Fotos que PhotoPrism aparta para revisar (baja calidad, sin fecha)       |
| Última foto añadida | Día de la toma y lugar: `14 may 2026 · Toulouse, Occitanie, France`      |
| Indexación en curso | 1 mientras se ejecuta una indexación o importación iniciada desde Gladys |

La integración lee el servidor por sí misma (tres peticiones por lectura): no
hay nada que ajustar en Gladys. El distintivo de conexión del dispositivo se
pone en rojo cuando el servidor deja de responder.

## Panel

El widget **Biblioteca de fotos** muestra los contadores de fotos, vídeos,
álbumes y fotos por revisar, las últimas fotos añadidas (lugar, día de la toma,
un distintivo para los vídeos; al tocar se ven el título y el día en que se
añadió) y dos botones: **Indexar** (archivos nuevos y modificados) e
**Importar** (la carpeta de importación). Mientras se ejecuta una tarea, una
línea de estado sustituye a los botones.

Las miniaturas están **desactivadas por defecto**: con el ajuste **Mostrar
miniaturas** aparece la imagen de 224 píxeles de cada foto, y sus fotos se ven
entonces en cualquier pantalla que muestre este panel (una tableta compartida,
un panel público, Gladys Plus). El navegador nunca carga PhotoPrism
directamente: Gladys se lo pide a la integración, que solo sirve las fotos que
lista el widget.

## Escenas

### Disparadores

- **Fotos nuevas añadidas**: se añadieron fotos o vídeos a la biblioteca, sea
  cual sea el medio (subida desde la aplicación, WebDAV, importación,
  indexación), vistos en la lectura siguiente. Variables: número de fotos y
  vídeos añadidos, fotos, vídeos, título, lugar y día de la toma de la última.
- **Fotos añadidas a un álbum**: un álbum contiene más fotos que en la lectura
  anterior (un álbum nuevo cuenta desde cero). Filtro: el título del álbum,
  exactamente como en PhotoPrism. Variables: título del álbum, fotos añadidas,
  fotos en el álbum.
- **Indexación o importación terminada**: ha terminado una indexación o una
  importación iniciada desde Gladys (escena o widget). Filtros: tipo
  (indexación, importación) y resultado (éxito, fallo). Variables: tipo,
  resultado, duración en segundos, fotos y vídeos añadidos.

Lo que añade una indexación o importación iniciada desde Gladys se anuncia de
una vez al terminar, justo antes de **Indexación o importación terminada**.

### Acciones

- **Iniciar una indexación**: PhotoPrism indexa los archivos nuevos y
  modificados de los originales, o de una carpeta (`2026/05`).
  **Reindexación completa (lenta)** vuelve a leer todos los archivos.
  Resultado: **Ya terminada** (una indexación de pocos archivos termina en
  menos de tres segundos).
- **Iniciar una importación**: PhotoPrism copia los archivos de su carpeta de
  importación a la biblioteca (se copian, no se mueven), en un álbum si indica
  uno (creado si hace falta). Resultado: **Ya terminada**.

Ambas acciones responden en pocos segundos: PhotoPrism sigue trabajando, y el
disparador **Indexación o importación terminada** avisa del final. Solo se
ejecuta una tarea iniciada desde Gladys a la vez; PhotoPrism también rechaza
una tarea mientras otra está en curso (iniciada desde su propia interfaz, por
ejemplo).

### Ideas de escenas

- Cada noche a las 3, **Iniciar una indexación**; con **Indexación o
  importación terminada** y el resultado «fallo», enviarse un mensaje.
- Con **Fotos nuevas añadidas**, enviar a la familia un mensaje con el número
  de fotos nuevas y el lugar de la última (variables del disparador).
- Con **Fotos añadidas a un álbum** «Vacaciones 2026», mostrar un mensaje en la
  tableta del salón.

## Solución de problemas

- **«contraseña de aplicación, usuario o contraseña rechazados»**: la
  contraseña de aplicación se borró o se escribió mal; con un usuario,
  compruebe la contraseña. Una cuenta con autenticación de dos factores
  necesita una contraseña de aplicación.
- **«permiso denegado»**: a la contraseña de aplicación le falta un alcance (la
  importación necesita acceso completo), o la cuenta no es de administrador.
- **«el servidor no responde»**: compruebe la dirección y el puerto (2342 para
  la imagen Docker) desde la máquina de Gladys.
- **«certificado rechazado»**: un certificado autofirmado; use la dirección
  `http://` de su red.
- **«ya hay una indexación o una importación en curso»**: PhotoPrism está
  ocupado; vuelva a intentarlo cuando termine.
- **La indexación termina en fallo al cabo de un minuto tras un proxy
  inverso**: el proxy cortó la petición (PhotoPrism solo responde al final).
  Use la dirección local o aumente el tiempo de espera del proxy.
- `LOG_LEVEL=debug` en los registros de la integración muestra cada lectura.

## Límites

- PhotoPrism no permite saber si hay una indexación en curso: **Indexación en
  curso** solo sigue las tareas iniciadas desde Gladys.
- Las fotos nuevas se ven en la lectura siguiente (5 minutos por defecto).
- Álbumes: solo los creados por los usuarios, no los momentos, carpetas ni el
  calendario.
- Ninguna foto sale de su red a través de la integración salvo que active las
  miniaturas del widget, y no se borra ni se mueve nada: sin limpieza, la
  importación copia.
- Sin relación con PhotoPrism UG. PhotoPrism es una marca registrada de
  PhotoPrism UG.
