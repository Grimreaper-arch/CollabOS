const loginForm = document.getElementById("loginForm");
const loginBtn = document.getElementById("loginBtn");
const errorMessage = document.getElementById("errorMessage");

window.addEventListener("load", () => {
    document.body.classList.add("loaded");
});

function navigate(url){
    document.body.classList.remove("loaded");
    document.body.classList.add("fade-out");

    setTimeout(()=>{window.location.href = url;},300);
}

loginForm.addEventListener("submit", function(e){
    e.preventDefault();
    errorMessage.classList.add("hidden");

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();
    const users = JSON.parse(localStorage.getItem("users")) || [];
    const user = users.find(user => user.email === email && user.password === password);

    if(!user){
        errorMessage.innerText = "Invalid email or password.";
        errorMessage.classList.remove("hidden");
        return;
    }

    // Accounts created before roles were added become student accounts by default.
    if (!user.role) {
        user.role = "student";
        localStorage.setItem("users", JSON.stringify(users));
    }

    loginBtn.disabled = true;
    loginBtn.innerHTML = `<span class="flex justify-center items-center gap-2"> Signing In... </span>`;

    localStorage.setItem("loggedInUser", JSON.stringify(user));
    setTimeout(() => {
        loginBtn.innerHTML = `
            <span class="flex justify-center items-center gap-2">
                Login Successful
                <span class="material-symbols-outlined">check_circle</span>
            </span>
        `;

        loginBtn.classList.remove("bg-primary");
        loginBtn.classList.add("bg-green-500","text-white");

        setTimeout(() => {
            window.location.href = "dashboard.html";
        },1000);
    },1000);
});
