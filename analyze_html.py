from bs4 import BeautifulSoup
import os

html_path = '/home/ubuntu/browser_html/skysports_com_la-liga-table_1780087198316.html'

if not os.path.exists(html_path):
    print(f"File not found: {html_path}")
    exit(1)

with open(html_path, 'r', encoding='utf-8') as f:
    soup = BeautifulSoup(f, 'html.parser')

# Find all tables
tables = soup.find_all('table')
print(f"Found {len(tables)} tables.")

for i, table in enumerate(tables):
    print(f"\nTable {i}:")
    classes = table.get('class', [])
    print(f"Classes: {classes}")
    
    # Check headers
    headers = [th.text.strip() for th in table.find_all('th')]
    print(f"Headers: {headers}")
    
    # Check first row of data
    rows = table.find_all('tr')
    if len(rows) > 1:
        first_data_row = rows[1]
        cols = [td.text.strip() for td in first_data_row.find_all('td')]
        print(f"First data row: {cols}")
        
        # Check team name link
        team_link = first_data_row.find('a', class_='standing-table__cell--name-link')
        if team_link:
            print(f"Team link text: {team_link.text.strip()}")
        else:
            print("Team link not found with class 'standing-table__cell--name-link'")
            # Look for any link in the second column
            tds = first_data_row.find_all('td')
            if len(tds) > 1:
                link = tds[1].find('a')
                if link:
                    print(f"Found alternative link in col 1: {link.text.strip()}")
