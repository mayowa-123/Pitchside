// Find the upload flow in app.js and add logging + use downloadUrl for playback
// We'll add a small helper function and patch the upload invocation (pcPublish / publishPost path)

(function addUploadLogging(){
  try{
    // Safe: attach to window so existing functions can call it
    window.pitchsideUploadWithPresign = async function(presignResp, file) {
      console.log('PitchSide upload debug — presign response', presignResp);
      const uploadUrl = presignResp.uploadUrl;
      const downloadUrl = presignResp.downloadUrl;

      // Upload the file
      const res = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
        mode: 'cors'
      });

      console.log('PitchSide upload result', res.status, res.statusText);
      if (!res.ok) {
        const text = await res.text().catch(()=>'');
        throw new Error(`Upload failed: ${res.status} ${res.statusText} ${text}`);
      }

      // Save metadata (example - you should replace with your Firestore save flow)
      try{
        if (window.saveUploadedVideoMeta) {
          await window.saveUploadedVideoMeta({
            url: downloadUrl,
            objectKey: presignResp.objectKey,
            mime: file.type,
            createdAt: Date.now()
          });
        }
      }catch(e){ console.warn('Failed to save uploaded video meta', e); }

      // Set player to the downloadUrl to play immediately
      const player = document.getElementById('editor-vid') || document.getElementById('editor-img') || document.querySelector('video');
      if (player && player.tagName && player.tagName.toLowerCase()==='video') {
        player.src = downloadUrl;
        player.load();
        try{ player.play(); }catch(e){}
      }

      return { uploadRes: res, downloadUrl };
    };

    console.log('PitchSide upload logging helper installed.');
  }catch(e){ console.error('Failed to install upload helper', e); }
})();
