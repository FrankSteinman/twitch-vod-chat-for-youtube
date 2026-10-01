# Twitch VOD Chat for YouTube

Una extensión de Chrome que permite mostrar chats de VOD de Twitch en YouTube.

[English](README.md)

<img width="2538" height="1360" alt="2026-09-30 04-28-35" src="https://github.com/user-attachments/assets/96ed68f7-c897-4733-ad3e-fa8957c08a81" />

## Funciones

<img width="435" height="632" alt="toolbar ext" src="https://github.com/user-attachments/assets/745625b0-8908-4003-a1e6-56aed5b1591a" />

<img width="471" height="294" alt="overlay" src="https://github.com/user-attachments/assets/6fa941aa-34d3-454c-b891-999cc5f5fe27" />

- Mostrar el chat de Twitch de un VOD junto a vídeos de YouTube
- Ajustar el desfase del chat para sincronizarlo con el vídeo
- Guardar el desfase en el archivo JSON original del chat
- Buscar mensajes del chat para encontrar puntos de sincronización
- Compatibilidad con emotes de Twitch, BTTV, FFZ y 7TV
- Compatibilidad con archivos JSON de chat grandes
- Modo de chat limpio para una apariencia minimalista (en el modo de chat limpio puedes mover el chat haciendo clic cerca de la parte superior)
- Mostrar u ocultar las marcas de tiempo
- Separar los mensajes para facilitar la lectura (también incluye un selector de color)
- Ajustar la opacidad del chat
- Cambiar el tamaño del chat arrastrando los laterales
- Ocultar la barra de desplazamiento sin perder la posibilidad de desplazarse por el chat
- Los ajustes están disponibles tanto desde el icono de la extensión como desde el propio chat
- Inglés, español, francés, japonés, coreano, portugués, alemán e italiano

## Instalación

Esta extensión se distribuye como una extensión de Chrome sin empaquetar.

1. Descarga el ZIP más reciente de la sección **Releases**.
2. Extrae el ZIP en algún lugar de tu ordenador.
3. Abre `chrome://extensions` en Chrome.
4. Activa el **modo de desarrollador**.
5. Haz clic en **Cargar descomprimida**.
6. Selecciona la carpeta de la extensión extraída.

Después de instalar o actualizar la extensión, actualiza las pestañas de YouTube que ya estuvieran abiertas.

## Cómo usar la extensión

Carga un archivo JSON del chat de Twitch desde el icono de la extensión o desde el propio chat. La extensión sincronizará el chat con la posición actual del vídeo de YouTube.

Usa los controles de **Desfase** para ajustar la sincronización. Un desfase positivo hace que el chat de Twitch mostrado avance con respecto al vídeo de YouTube.

Puedes guardar el desfase en el archivo JSON original después de cargar el chat.

## Cómo conseguir los archivos del chat

Recomiendo usar [TwitchDownloader](https://github.com/lay295/TwitchDownloader) para descargar el chat del VOD como un archivo **JSON**. Yo activé **3rd Party Emotes** al descargar el chat y me funcionó bien.

Después puedes cargar directamente el JSON descargado en la extensión.

## Privacidad

Los archivos del chat se procesan localmente en el navegador. La extensión no requiere una cuenta ni un servicio aparte para mostrar el chat.

Consulta `PRIVACY.md` para obtener más información.

## Versión actual

**1.03**

Este es un proyecto casual. Es posible que haga actualizaciones de vez en cuando cuando haya algo que arreglar o deje de funcionar. Todo esto se ha hecho con la ayuda de ChatGPT.
