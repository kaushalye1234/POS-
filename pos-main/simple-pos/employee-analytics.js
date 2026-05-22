// =============================================
// Employee Analytics Module
// =============================================

// Get comprehensive employee statistics
async function getEmployeeStats(employeeId, period = 'all') {
    const sales = await getEmployeeSales(employeeId, period);
    const revenue = await getEmployeeRevenue(employeeId, period);

    return {
        salesCount: sales.length,
        totalRevenue: revenue,
        averagePerSale: sales.length > 0 ? revenue / sales.length : 0,
        totalItems: sales.reduce((sum, sale) => sum + (sale.itemsCount || 0), 0)
    };
}

// Get  statistics for all employees across all periods
async function getAllEmployeesStatsWithPeriods() {
    const employees = await getAllEmployees();
    const periods = ['today', 'week', 'year', 'all'];

    const results = await Promise.all(
        employees.map(async (emp) => {
            const stats = {};
            const employeeId = emp.id || emp.empId;

            for (const period of periods) {
                stats[period] = await getEmployeeStats(employeeId, period);
            }

            return {
                ...emp,
                stats
            };
        })
    );

    return results;
}

// Get top performers for a specific period
async function getTopPerformers(period = 'all', limit = 5) {
    const employeesWithStats = await getAllEmployeesStatsWithPeriods();

    // Sort by revenue for the specific period
    const sorted = employeesWithStats.sort((a, b) => {
        return (b.stats[period]?.totalRevenue || 0) - (a.stats[period]?.totalRevenue || 0);
    });

    return sorted.slice(0, limit);
}

// Get average sales per employee for a period
async function getAverageSalesPerEmployee(period = 'all') {
    const employeesWithStats = await getAllEmployeesStatsWithPeriods();

    const totalSales = employeesWithStats.reduce((sum, emp) => {
        return sum + (emp.stats[period]?.salesCount || 0);
    }, 0);

    const employeeCount = employeesWithStats.length;
    return employeeCount > 0 ? totalSales / employeeCount : 0;
}

// Render employee analytics dashboard
async function renderEmployeeAnalytics(containerId, period = 'today') {
    const container = document.getElementById(containerId);
    if (!container) return;

    const employeesWithStats = await getAllEmployeesStatsWithPeriods();
    const topPerformers = await getTopPerformers(period, 3);
    const avgSales = await getAverageSalesPerEmployee(period);

    const totalSales = employeesWithStats.reduce((sum, emp) =>
        sum + (emp.stats[period]?.salesCount || 0), 0
    );

    const totalRevenue = employeesWithStats.reduce((sum, emp) =>
        sum + (emp.stats[period]?.totalRevenue || 0), 0
    );

    const html = `
            <div class="glass-card p-6 rounded-2xl">
                <div class="stat-icon">👥</div>
                <div class="stat-label">Total Employees</div>
                <div class="stat-value">${employeesWithStats.length}</div>
            </div>
            
            <div class="glass-card p-6 rounded-2xl">
                <div class="stat-icon">🏆</div>
                <div class="stat-label">Top Performer</div>
                <div class="stat-value">${topPerformers[0]?.name || 'N/A'}</div>
                <div class="stat-sublabel">Rs.${(topPerformers[0]?.stats[period]?.totalRevenue || 0).toLocaleString()}</div>
            </div>
            
            <div class="glass-card p-6 rounded-2xl">
                <div class="stat-icon">💰</div>
                <div class="stat-label">Total Revenue</div>
                <div class="stat-value">Rs.${totalRevenue.toLocaleString()}</div>
            </div>
            
            <div class="glass-card p-6 rounded-2xl">
                <div class="stat-icon">📊</div>
                <div class="stat-label">Avg Sales/Employee</div>
                <div class="stat-value">${avgSales.toFixed(1)}</div>
            </div>
    `;

    container.innerHTML = html;
}

/* placeholder aria-label */
