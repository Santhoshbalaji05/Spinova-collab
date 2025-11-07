import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, addDoc, query, where, getDocs, doc, updateDoc, deleteDoc, getDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let currentUser = null;
let currentTeam = null;
let currentMode = 'team';
let tasks = [];
let members = [];
let statusChart = null;
let memberChart = null;
let isTeamLeader = false;

// Check authentication
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        
        // Load team data from session
        const teamData = sessionStorage.getItem('currentTeamData');
        if (teamData) {
            currentTeam = JSON.parse(teamData);
            
            // Check if current user is team leader
            isTeamLeader = currentTeam.leaderId === currentUser.uid;
            
            await initDashboard();
            setupEventListeners();
        } else {
            window.location.href = 'team.html';
        }
    } else {
        window.location.href = 'login.html';
    }
});

async function initDashboard() {
    await loadUserProfile();
    updateModeUI();
    updatePermissions();
    await loadMembers();
    await loadTasks();
    await loadChatMessages();
    updateStats();
    updateCharts();
}

function setupEventListeners() {
    // Mode switch
    document.getElementById('soloBtn').addEventListener('click', () => switchMode('solo'));
    document.getElementById('teamBtn').addEventListener('click', () => switchMode('team'));
    
    // Task management
    const addTaskBtn = document.getElementById('addTaskBtn');
    if (addTaskBtn) {
        addTaskBtn.addEventListener('click', addQuickTask);
    }
    
    const addMemberBtn = document.getElementById('addMemberBtn');
    if (addMemberBtn) {
        addMemberBtn.addEventListener('click', addMember);
    }
    
    // Filters
    document.getElementById('clearFiltersBtn').addEventListener('click', clearFilters);
    document.getElementById('exportBtn').addEventListener('click', exportCSV);
    document.getElementById('searchTasks').addEventListener('input', renderTasks);
    document.getElementById('filterStatus').addEventListener('change', renderTasks);
    
    // Chat
    document.getElementById('chatInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendChatMessage();
        }
    });
    document.getElementById('sendChatBtn').addEventListener('click', sendChatMessage);
    
    // Profile
    const profileTrigger = document.getElementById('profileTrigger');
    const profileDropdown = document.getElementById('profileDropdown');
    const changePhotoBtn = document.getElementById('changePhotoBtn');
    const profileImageInput = document.getElementById('profileImageInput');
    const logoutBtnProfile = document.getElementById('logoutBtnProfile');
    
    if (profileTrigger && profileDropdown) {
        profileTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            profileDropdown.classList.toggle('active');
        });
        
        document.addEventListener('click', (e) => {
            if (!profileDropdown.contains(e.target) && !profileTrigger.contains(e.target)) {
                profileDropdown.classList.remove('active');
            }
        });
    }
    
    if (changePhotoBtn && profileImageInput) {
        changePhotoBtn.addEventListener('click', () => {
            profileImageInput.click();
        });
        
        profileImageInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            if (file.size > 2 * 1024 * 1024) {
                return alert('Image size must be less than 2MB');
            }
            
            if (!file.type.startsWith('image/')) {
                return alert('Please select an image file');
            }
            
            const reader = new FileReader();
            reader.onload = async (event) => {
                const imageData = event.target.result;
                
                try {
                    await updateDoc(doc(db, 'users', currentUser.uid), {
                        profileImage: imageData
                    });
                    
                    updateProfileImage(imageData);
                    alert('Profile picture updated successfully!');
                } catch (error) {
                    alert('Error updating profile picture: ' + error.message);
                }
            };
            reader.readAsDataURL(file);
        });
    }
    
    if (logoutBtnProfile) {
        logoutBtnProfile.addEventListener('click', () => {
            signOut(auth);
            sessionStorage.clear();
            window.location.href = 'login.html';
        });
    }
}

function switchMode(mode) {
    currentMode = mode;
    document.getElementById('soloBtn').classList.toggle('active', mode === 'solo');
    document.getElementById('teamBtn').classList.toggle('active', mode === 'team');
    updateModeUI();
    updatePermissions();
    loadTasks();
    loadChatMessages();
}

function updateModeUI() {
    const isSolo = currentMode === 'solo';
    
    const teamLeaderSection = document.getElementById('teamLeaderSection');
    const addMemberSection = document.getElementById('addMemberSection');
    const quickAddSection = document.getElementById('quickAddSection');
    
    if (teamLeaderSection) teamLeaderSection.style.display = isSolo ? 'none' : 'block';
    if (addMemberSection) addMemberSection.style.display = isSolo ? 'none' : 'block';
    if (quickAddSection) quickAddSection.style.display = isSolo ? 'block' : 'none';
    
    if (!isSolo && currentTeam) {
        const teamLeaderName = document.getElementById('teamLeaderName');
        if (teamLeaderName) {
            teamLeaderName.textContent = currentTeam.leaderName || '-';
        }
    }
    
    const assigneeSelect = document.getElementById('quickAssignee');
    if (assigneeSelect) {
        if (isSolo) {
            assigneeSelect.innerHTML = `<option value="${currentUser.displayName}" selected>${currentUser.displayName}</option>`;
            assigneeSelect.disabled = true;
        } else {
            assigneeSelect.disabled = false;
            updateAssigneeOptions();
        }
    }
}

function updatePermissions() {
    const isSolo = currentMode === 'solo';
    const quickAddSection = document.getElementById('quickAddSection');
    const addMemberSection = document.getElementById('addMemberSection');
    
    if (!isSolo) {
        if (isTeamLeader) {
            if (quickAddSection) quickAddSection.style.display = 'block';
            if (addMemberSection) addMemberSection.style.display = 'block';
        } else {
            if (quickAddSection) quickAddSection.style.display = 'none';
            if (addMemberSection) addMemberSection.style.display = 'none';
        }
    }
}

async function loadMembers() {
    if (currentMode === 'solo') {
        members = [{ id: currentUser.uid, name: currentUser.displayName }];
    } else if (currentTeam) {
        const teamDoc = await getDoc(doc(db, 'teams', currentTeam.id));
        if (teamDoc.exists()) {
            const teamData = teamDoc.data();
            members = teamData.members || [];
            currentTeam = { id: teamDoc.id, ...teamData };
            sessionStorage.setItem('currentTeamData', JSON.stringify(currentTeam));
        }
    }
    updateAssigneeOptions();
}

function updateAssigneeOptions() {
    const select = document.getElementById('quickAssignee');
    if (!select) return;
    
    select.innerHTML = '<option value="">Select assignee</option>';
    members.forEach(member => {
        const option = document.createElement('option');
        option.value = member.name;
        option.textContent = member.name;
        select.appendChild(option);
    });
}

async function addMember() {
    const name = document.getElementById('memberName').value.trim();
    if (!name) return alert('Please enter a name');
    
    if (currentMode === 'solo') return alert('Cannot add members in solo mode');
    if (!currentTeam) return alert('No team selected');
    
    if (!isTeamLeader) {
        return alert('Only team leader can add members');
    }
    
    const newMember = { id: `temp_${Date.now()}`, name: name };
    
    try {
        const teamRef = doc(db, 'teams', currentTeam.id);
        const teamDoc = await getDoc(teamRef);
        const teamData = teamDoc.data();
        
        teamData.members.push(newMember);
        
        await updateDoc(teamRef, {
            members: teamData.members
        });
        
        members = teamData.members;
        document.getElementById('memberName').value = '';
        updateAssigneeOptions();
        updateCharts();
    } catch (error) {
        alert('Error adding member: ' + error.message);
    }
}

async function loadTasks() {
    try {
        let q;
        if (currentMode === 'solo') {
            q = query(collection(db, 'tasks'), 
                where('userId', '==', currentUser.uid),
                where('mode', '==', 'solo'));
        } else if (currentTeam) {
            q = query(collection(db, 'tasks'), 
                where('teamId', '==', currentTeam.id));
        }
        
        if (q) {
            const snapshot = await getDocs(q);
            tasks = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
            renderTasks();
            updateStats();
            updateCharts();
        }
    } catch (error) {
        console.error('Error loading tasks:', error);
    }
}

async function addQuickTask() {
    if (currentMode === 'team' && !isTeamLeader) {
        return alert('Only team leader can create tasks');
    }
    
    const title = document.getElementById('quickTaskTitle').value.trim();
    const assignee = document.getElementById('quickAssignee').value;
    const status = document.getElementById('quickStatus').value;
    const hours = parseInt(document.getElementById('quickHours').value) || 1;
    const due = document.getElementById('quickDue').value;
    
    if (!title) return alert('Please enter a task title');
    if (!assignee) return alert('Please select an assignee');
    if (!due) return alert('Please select a due date');
    
    const task = {
        title,
        assignee,
        status,
        hours,
        due,
        userId: currentUser.uid,
        createdBy: currentUser.displayName,
        mode: currentMode,
        teamId: currentMode === 'team' ? currentTeam.id : null,
        createdAt: new Date().toISOString()
    };
    
    try {
        await addDoc(collection(db, 'tasks'), task);
        
        document.getElementById('quickTaskTitle').value = '';
        document.getElementById('quickHours').value = '';
        document.getElementById('quickDue').value = '';
        
        await loadTasks();
    } catch (error) {
        alert('Error adding task: ' + error.message);
    }
}

function renderTasks() {
    const tbody = document.getElementById('tasksTableBody');
    const searchTerm = document.getElementById('searchTasks').value.toLowerCase();
    const filterStatus = document.getElementById('filterStatus').value;
    
    let filteredTasks = tasks.filter(task => {
        const matchesSearch = task.title.toLowerCase().includes(searchTerm);
        const matchesStatus = !filterStatus || task.status === filterStatus;
        return matchesSearch && matchesStatus;
    });
    
    tbody.innerHTML = '';
    
    filteredTasks.forEach(task => {
        const tr = document.createElement('tr');
        
        const canModify = currentMode === 'solo' || 
                         isTeamLeader || 
                         task.assignee === currentUser.displayName;
        
        const deleteBtn = (currentMode === 'team' && isTeamLeader) || currentMode === 'solo'
            ? `<button class="btn-sm btn-delete" onclick="window.deleteTask('${task.id}')">Delete</button>`
            : '';
        
        tr.innerHTML = `
            <td>${task.title}</td>
            <td>${task.assignee}</td>
            <td><span class="status-badge status-${task.status}">${task.status}</span></td>
            <td>${task.hours}</td>
            <td>${task.due}</td>
            <td class="task-actions">
                ${canModify ? `<button class="btn-sm btn-next" onclick="window.nextStatus('${task.id}', '${task.status}')">Next</button>` : ''}
                ${deleteBtn}
            </td>
        `;
        tbody.appendChild(tr);
    });
}

window.nextStatus = async function(taskId, currentStatus) {
    const task = tasks.find(t => t.id === taskId);
    
    if (currentMode === 'team' && !isTeamLeader && task.assignee !== currentUser.displayName) {
        return alert('You can only update your own tasks');
    }
    
    const statusFlow = { 'todo': 'in-progress', 'in-progress': 'done', 'done': 'todo' };
    const newStatus = statusFlow[currentStatus];
    
    try {
        await updateDoc(doc(db, 'tasks', taskId), { status: newStatus });
        await loadTasks();
    } catch (error) {
        alert('Error updating task: ' + error.message);
    }
}

window.deleteTask = async function(taskId) {
    if (currentMode === 'team' && !isTeamLeader) {
        return alert('Only team leader can delete tasks');
    }
    
    if (!confirm('Are you sure you want to delete this task?')) return;
    
    try {
        await deleteDoc(doc(db, 'tasks', taskId));
        await loadTasks();
    } catch (error) {
        alert('Error deleting task: ' + error.message);
    }
}

function updateStats() {
    const total = tasks.length;
    const done = tasks.filter(t => t.status === 'done').length;
    const onTrack = tasks.filter(t => t.status === 'in-progress').length;
    const blocked = 0;
    
    document.getElementById('totalTasks').textContent = total;
    document.getElementById('doneTasks').textContent = done;
    document.getElementById('onTrackTasks').textContent = onTrack;
    document.getElementById('blockedTasks').textContent = blocked;
}

function updateCharts() {
    updateStatusChart();
    updateMemberChart();
}

function updateStatusChart() {
    const ctx = document.getElementById('statusChart').getContext('2d');
    
    const todo = tasks.filter(t => t.status === 'todo').length;
    const inProgress = tasks.filter(t => t.status === 'in-progress').length;
    const done = tasks.filter(t => t.status === 'done').length;
    
    if (statusChart) statusChart.destroy();
    
    statusChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: ['Todo', 'In Progress', 'Done'],
            datasets: [{
                data: [todo, inProgress, done],
                backgroundColor: ['#32B8C6', '#FFA500', '#E68161']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 1.5,
            plugins: {
                legend: { 
                    display: true,
                    position: 'top',
                    labels: { 
                        color: '#f5f5f5',
                        padding: 10,
                        font: { size: 11 }
                    }
                }
            }
        }
    });
}

function updateMemberChart() {
    const ctx = document.getElementById('memberChart').getContext('2d');
    
    const memberTasks = {};
    members.forEach(m => memberTasks[m.name] = 0);
    tasks.forEach(t => {
        if (memberTasks[t.assignee] !== undefined) {
            memberTasks[t.assignee]++;
        }
    });
    
    if (memberChart) memberChart.destroy();
    
    memberChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: Object.keys(memberTasks),
            datasets: [{
                label: 'Tasks',
                data: Object.values(memberTasks),
                backgroundColor: '#32B8C6'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 1.5,
            plugins: {
                legend: { 
                    display: true,
                    labels: { 
                        color: '#f5f5f5',
                        font: { size: 11 }
                    }
                }
            },
            scales: {
                y: { 
                    beginAtZero: true,
                    ticks: { 
                        color: '#f5f5f5',
                        font: { size: 10 }
                    },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' }
                },
                x: { 
                    ticks: { 
                        color: '#f5f5f5',
                        font: { size: 10 }
                    },
                    grid: { display: false }
                }
            }
        }
    });
}

function clearFilters() {
    document.getElementById('searchTasks').value = '';
    document.getElementById('filterStatus').value = '';
    renderTasks();
}

function exportCSV() {
    const headers = ['Title', 'Assignee', 'Status', 'Hours', 'Due'];
    const rows = tasks.map(t => [t.title, t.assignee, t.status, t.hours, t.due]);
    
    let csv = headers.join(',') + '\n';
    rows.forEach(row => {
        csv += row.join(',') + '\n';
    });
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `collabflow-tasks-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
}

// ============= TEAM CHAT FUNCTIONS =============

async function sendChatMessage() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();
    
    if (!message) return;
    
    if (currentMode === 'solo') {
        return alert('Chat is only available in team mode');
    }
    
    if (!currentTeam) {
        return alert('No team selected');
    }
    
    try {
        await addDoc(collection(db, 'messages'), {
            teamId: currentTeam.id,
            userId: currentUser.uid,
            userName: currentUser.displayName,
            message: message,
            timestamp: new Date().toISOString()
        });
        
        input.value = '';
        await loadChatMessages();
    } catch (error) {
        alert('Error sending message: ' + error.message);
    }
}

async function loadChatMessages() {
    const chatPanelMain = document.getElementById('chatPanelMain');
    if (!chatPanelMain) return;
    
    if (currentMode === 'solo' || !currentTeam) {
        chatPanelMain.style.display = 'none';
        return;
    }
    
    chatPanelMain.style.display = 'flex';
    
    try {
        const q = query(
            collection(db, 'messages'),
            where('teamId', '==', currentTeam.id)
        );
        
        const snapshot = await getDocs(q);
        const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        
        renderChatMessages(messages);
    } catch (error) {
        console.error('Error loading chat:', error);
    }
}


function renderChatMessages(messages) {
    const container = document.getElementById('chatMessages');
    if (!container) return;
    
    if (messages.length === 0) {
        container.innerHTML = '<div class="chat-empty">No messages yet. Start the conversation!</div>';
        return;
    }
    
    container.innerHTML = '';
    
    messages.forEach(msg => {
        const isOwn = msg.userId === currentUser.uid;
        const msgDiv = document.createElement('div');
        msgDiv.className = `chat-message ${isOwn ? 'chat-message-own' : ''}`;
        
        const time = new Date(msg.timestamp);
        const timeStr = time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        
        msgDiv.innerHTML = `
            <div class="chat-sender">${msg.userName}${isOwn ? ' (You)' : ''}</div>
            <div class="chat-text">${escapeHtml(msg.message)}</div>
            <div class="chat-time">${timeStr}</div>
        `;
        
        container.appendChild(msgDiv);
    });
    
    container.scrollTop = container.scrollHeight;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============= USER PROFILE FUNCTIONS =============

async function loadUserProfile() {
    if (!currentUser) return;
    
    try {
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        
        const userName = currentUser.displayName || 'User';
        const userEmail = currentUser.email;
        
        const headerUserName = document.getElementById('headerUserName');
        const profileName = document.getElementById('profileName');
        const profileEmail = document.getElementById('profileEmail');
        
        if (headerUserName) headerUserName.textContent = userName;
        if (profileName) profileName.textContent = userName;
        if (profileEmail) profileEmail.textContent = userEmail;
        
        if (userDoc.exists()) {
            const userData = userDoc.data();
            if (userData.profileImage) {
                updateProfileImage(userData.profileImage);
            } else {
                const defaultAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=32B8C6&color=fff&size=128`;
                updateProfileImage(defaultAvatar);
            }
        } else {
            const defaultAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=32B8C6&color=fff&size=128`;
            updateProfileImage(defaultAvatar);
        }
    } catch (error) {
        console.error('Error loading profile:', error);
    }
}

function updateProfileImage(imageData) {
    const headerProfileImg = document.getElementById('headerProfileImg');
    const dropdownProfileImg = document.getElementById('dropdownProfileImg');
    
    if (headerProfileImg) headerProfileImg.src = imageData;
    if (dropdownProfileImg) dropdownProfileImg.src = imageData;
}

// Auto-refresh chat every 5 seconds
setInterval(() => {
    if (currentMode === 'team' && currentTeam) {
        loadChatMessages();
    }
}, 5000);
