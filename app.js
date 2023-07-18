if (process.env.NODE_ENV !== "production") {
    require('dotenv').config();
}

const express = require("express");
const mysql = require("mysql2");
const axios = require("axios");
const app = express();

const months = { "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6, "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12 };

const pool = mysql.createPool({
  host: "127.0.0.1",
  user: process.env.DBUSERNAME,
  database: process.env.DBNAME,
  password: process.env.DBPASSWORD,
}).promise();

app.use(express.json());

app.get("/api/init-database", async (req, res) => {
    const connection = await pool.getConnection();
    try {
      const response = await axios.get("https://s3.amazonaws.com/roxiler.com/product_transaction.json");

      await connection.query("drop table if exists product_transactions");
      await connection.query("create table if not exists product_transactions(id INTEGER PRIMARY KEY,title VARCHAR(255),price INTEGER, description VARCHAR(4096),category VARCHAR(255),image VARCHAR(255),sold Boolean,dateOfSale datetime)");
      const data = response.data;
      for (row of data) {
        await connection.query("insert into product_transactions values(?,?,?,?,?,?,?,?)", [row.id, row.title, row.price, row.description, row.category, row.image, row.sold, row.dateOfSale]);
      }
      res.status(200).json({success:"database initialized successfully"});
    } catch (error) {
        console.error("Error initializing database:", error);
        res.status(500).send("Error occurred while initializing database");
    } finally {
       connection.release(); 
    }
  
});

app.get("/api/stats/:month", async (req, res) => {
    try {
        const { month } = req.params;
        const monthNo = months[month.toLowerCase()];
      if (monthNo) {
        const connection = await pool.getConnection();
        let row = await connection.query("select sum(price) as totalSaleAmount from product_transactions where month(dateOfSale)=?", [monthNo]);
        const totalSaleAmount = row[0][0].totalSaleAmount;

        row = await connection.query("select count(id) as totalSoldItems from product_transactions where month(dateOfSale)=? and sold=true", [monthNo]);
        const totalSoldItems = row[0][0].totalSoldItems;

        row = await connection.query("select count(id) as totalNotSoldItems from product_transactions where month(dateOfSale)=? and sold = false", [monthNo]);
        const totalNotSoldItems = row[0][0].totalNotSoldItems;
          
        res.status(200).json({ stats: { totalSoldItems, totalSaleAmount, totalNotSoldItems } })
        connection.release();
        
      } else {
        res.status(400).json({ error: "Invalid month" });
      }    
    } catch (error) {
         console.error("Error retrieving stats:", error);
        res.status(500).send("An error occurred while retrieving the stats");
    }
});



app.get("/api/bar-chart/:month", async (req, res) => {
  
  let connection;
  try {
    const { month } = req.params;
    const monthNo = months[month.toLowerCase()];

    connection = await pool.getConnection();
    const query = `
      select
        case
          when price between 0 and 100 then '0 - 100'
          when price between 101 and 200 then '101 - 200'
          when price between 201 and 300 then '201 - 300'
          when price between 301 and 400 then '301 - 400'
          when price between 401 and 500 then '401 - 500'
          when price between 501 and 600 then '501 - 600'
          when price between 601 and 700 then '601 - 700'
          when price between 701 and 800 then '701 - 800'
          when price between 801 and 900 then '801 - 900'
          else '901-above'
        end as price_range,
        count(*) AS item_count
      from product_transactions
      where MONTH(dateOfSale) = ?
      group by price_range
      order by price_range
    `;
    const params = [monthNo];

    const row = await connection.query(query, params);
    const barChartData = row[0];
    res.status(200).json({ barChartData });
      
  } catch (error) {
    console.error("Error retrieving bar chart data:", error);
    res.status(500).json({ error: "An error occurred while retrieving the bar chart data"});
  } finally {
      connection.release();
  }
});

app.get("/api/pie-chart/:month", async (req, res) => {
  let connection;
  try {
    const { month } = req.params;
    const monthNo = months[month.toLowerCase()];
    connection = await pool.getConnection();
    const query = `
      select category, count(*) as item_count
      from product_transactions
      where month(dateOfSale) = ?
      group by category
    `;
    const params = [monthNo];

    const rows = await connection.query(query, params);
    const pieChartData = rows[0];

    connection.release();

    res.status(200).json({ pieChartData });
  } catch (error) {
    console.error("Error retrieving pie chart data:", error);
    res.status(500).json({error: "An error occurred while retrieving the pie chart data."});
  } finally {
    connection.release();
  }
});

app.get("/api/all-data/:month", async (req, res) => {
  try {
    const { month } = req.params;

    const [statsResponse,barChartResponse,pieChartDataResponse,] = await Promise.all([
      axios.get(`http://localhost:3000/api/stats/${month}`),
      axios.get(`http://localhost:3000/api/bar-chart/${month}`),
      axios.get(`http://localhost:3000/api/pie-chart/${month}`),
    ]);

    const stats = statsResponse.data.stats;
    const barChartData = barChartResponse.data.barChartData;
    const pieChartData = pieChartDataResponse.data.pieChartData;

    const allData = {stats, barChartData,pieChartData};

    res.status(200).json(allData);
  } catch (error) {
    console.error("Error fetching all data:", error);
    res.status(500).json({ error: "An error occurred while fetching the all data."});
  }
});

const port = process.env.PORT;

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
