const authSection = document.getElementById('authSection')


function renderAuthSection(){
    
    const loggedInUser = JSON.parse(localStorage.getItem("loggedInUser"));

    if(!loggedInUser){ 
        authSection.innerHTML = `
            <a href="login.html"
                class="text-[15px] text-[#d0d0d6]">
                Log in
            </a>

            <a href="signup.html"
                class="h-[30px] px-5 flex items-center justify-center
                       bg-[#b7b5ff] border border-[#d1d0ff]
                       text-[13px] font-semibold text-[#12122a]">
                START BUILDING
            </a>
        `;    
        return;
    }

    authSection.innerHTML = `
         <span class="text-[15px] text-[#d0d0d6]">
            Hi, ${loggedInUser.fullName}
        </span>
        <button id="logoutBtn"
            class="h-[30px] px-5 flex items-center justify-center
                   border border-[#454651]
                   text-[13px] font-semibold text-[#d0d0d6]
                   hover:bg-[#4176D1] transition">
            Logout
        </button>
    `;

    document.getElementById("logoutBtn").addEventListener("click",logout)

}

function logout() {

    localStorage.removeItem("loggedInUser");

    renderAuthSection();
}

// Run when page loads
document.addEventListener("DOMContentLoaded", () => {

    renderAuthSection();

});