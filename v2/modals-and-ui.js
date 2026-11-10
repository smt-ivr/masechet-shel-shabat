function showAlert(message) {
    customAlertMessage.innerHTML = message;
    customAlertModal.classList.remove('hidden');
}

function openAudioModal(path, clientName) {
    const token = localStorage.getItem('yemotToken');
    const downloadUrl = `https://www.call2all.co.il/ym/api/DownloadFile?token=${token}&path=${path}`;
    audioClientName.innerHTML = `<i class="fa fa-user-circle-o"></i> לקוח: ${clientName}`;
    audioPlayer.src = downloadUrl;
    audioModal.classList.remove('hidden');
    audioPlayer.play().catch(e => console.log('Auto-play prevented by browser', e));
}

document.addEventListener('DOMContentLoaded', () => {
    closeAlertBtn.addEventListener('click', () => customAlertModal.classList.add('hidden'));

    closeAudioModalBtn.addEventListener('click', () => {
        audioModal.classList.add('hidden');
        audioPlayer.pause();
        audioPlayer.src = ""; 
    });
});