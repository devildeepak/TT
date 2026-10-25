import json, base64, uuid, random
random.seed(7)
D=[[0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0]]
P=[[0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]]
INV=[0,4,3,2,1,5,6,7,8,9]
def aadhaar():
    b=str(random.randint(2,9))+"".join(str(random.randint(0,9)) for _ in range(10)); c=0
    for i,ch in enumerate(reversed(b)): c=D[c][P[(i+1)%8][int(ch)]]
    return b+str(INV[c])
def chk(n):
    c=0
    for i,ch in enumerate(reversed(n)): c=D[c][P[i%8][int(ch)]]
    return c==0
png=base64.b64encode(open('doc.png','rb').read()).decode()
DOC="testdoc-aadhaar"; CERT="testdoc-cert"; PHOTO="testdoc-photo"
docs={k:"data:image/png;base64,"+png for k in (DOC,CERT,PHOTO)}
uid=lambda: str(uuid.UUID(int=random.getrandbits(128)))
def person(name,age,g,idt="AADHAAR",**kw):
    p={"id":uid(),"name":name,"age":age,"gender":g,"idType":idt,"idNumber":aadhaar() if idt=="AADHAAR" else kw.pop("pp"),"tags":[],"docs":{}}
    p.update(kw); return p
def link(a,b): a["spouseId"]=b["id"]; b["spouseId"]=a["id"]
def prof(name,persons,city,state,pin,country="India",gothram=None,email=None):
    c={"email":email or f"test.{name.lower().split()[0]}@example.com","mobile":"9"+str(random.randint(100000000,999999999)),"city":city,"state":state,"country":country,"pincode":pin}
    if gothram: c["gothram"]=gothram
    return {"id":uid(),"name":name,"persons":persons,"contact":c,"selection":[p["id"] for p in persons]}
sen=lambda **k:{"tags":["SENIOR"],"docs":{"aadhaar":"docid:"+DOC},**k}

P1=[person("Test Ramesh Kumar",45,"M"),person("Test Lakshmi Kumar",42,"F"),person("Test Sai Kumar",16,"M"),person("Test Anu Kumar",12,"F"),person("Test Gopal Kumar",72,"M"),person("Test Sita Kumar",67,"F")]
a=person("Test Venkata Rao",71,"M",**sen()); b=person("Test Kamala Rao",66,"F",**sen()); link(a,b)
nri=[person("Test Arjun Reddy",38,"M","PASSPORT",pp="N1234567",passport={"country":"United States","visaNo":"OCI1234567","visaType":"OCI","validity":"31/12/2030"}),
     person("Test Priya Reddy",35,"F","PASSPORT",pp="M7654321",passport={"country":"United States","visaNo":"OCI7654321","visaType":"OCI","validity":"31/12/2030"}),
     person("Test Riya Reddy",8,"F","PASSPORT",pp="Z9988776",passport={"country":"United States","visaNo":"V12345678","visaType":"Tourist","validity":"15/06/2027"})]
mixed=[person("Test Kiran Shetty",41,"M"),person("Test Divya Shetty",39,"F","PASSPORT",pp="K2345678",passport={"country":"Singapore","visaNo":"OCI2223334","visaType":"OCI","validity":"01/03/2029"})]
da=person("Test Suresh Babu",52,"M",tags=["DIFFERENTLY_ABLED"],docs={"cert":"docid:"+CERT,"aadhaar":"docid:"+DOC}); att=person("Test Ravi Babu",26,"M")
solo=[person("Test Mahesh Naidu",29,"M")]
srivani=[person("Test Harish Iyer",50,"M"),person("Test Meena Iyer",47,"F"),person("Test Karthik Iyer",21,"M"),person("Test Divya Iyer",19,"F")]
big=[person(f"Test Friend {n}",age,g) for n,age,g in [("Arun",30,"M"),("Bhavana",28,"F"),("Chetan",33,"M"),("Deepa",31,"F"),("Eshwar",35,"M"),("Farah",27,"F"),("Ganesh",40,"M"),("Hema",29,"F")]]
# Edge cases: invalid data to test readiness warnings + TTD error handling
bad=[person("Test Invalid Aadhaar",30,"M",idNumber="123456789012"),person("Test Short Id",25,"F",idNumber="12345"),
     person("Test Expired Visa",44,"M","PASSPORT",pp="P1112223",passport={"country":"United Kingdom","visaNo":"V998877","visaType":"Tourist","validity":"01/01/2024"}),
     person("Test Young Senior",58,"F",**sen())]
s1=person("Test Narayana Murthy",78,"M",**sen(),dob="12/05/1948"); s2=person("Test Saraswathi Murthy",74,"F",**sen(),dob="03/09/1952"); link(s1,s2)

profiles=[
 prof("01 Family of 6 (SED)",P1,"Bengaluru","Karnataka","560037"),
 prof("02 Senior couple",[a,b],"Tirupati","Andhra Pradesh","517501"),
 prof("03 NRI family (passport)",nri,"Hyderabad","Telangana","500081",email="test.nri@example.com"),
 prof("04 Mixed Aadhaar + passport",mixed,"Mangaluru","Karnataka","575001"),
 prof("05 Differently-abled + attendant",[da,att],"Chennai","Tamil Nadu","600028"),
 prof("06 Single (Angapradakshinam)",solo,"Vijayawada","Andhra Pradesh","520010"),
 prof("07 Srivani group of 4",srivani,"Chennai","Tamil Nadu","600004",gothram="Bharadwaja"),
 prof("08 Friends 8 (over limit)",big,"Pune","Maharashtra","411001"),
 prof("09 Invalid data (edge cases)",bad,"Nellore","Andhra Pradesh","524001"),
 prof("10 Senior couple with DOB",[s1,s2],"Mysuru","Karnataka","570001",gothram="Kashyapa"),
]
def member(n,sur,g,dob,state,district,city,pin,mob):
    return {"identity":{"idType":"Aadhaar Card","idNumber":aadhaar(),"name":n,"surname":sur,"fatherOrSpouse":"Test "+sur+" Sr","dob":dob,"mobile":mob,"email":f"test.{n.lower()}@example.com","bloodGroup":random.choice(["A+","B+","O+","AB+"]),"gender":g,"mentallyFit":True,"physicallyFit":True},
            "address":{"street":"Test Street "+str(random.randint(1,99)),"doorNo":str(random.randint(1,300)),"pincode":pin,"country":"India","state":state,"district":district,"city":city,"nearestTemple":"Bengaluru"},"photo":"docid:"+PHOTO}
seva=member("Srinivas","Test","Male","15/08/1985","Karnataka","Bengaluru Urban","Bengaluru","560001","9876500001")
seva.update({"volunteer":{"qualification":"B.E.","profession":"Software Engineer","employeeId":"TST001","designation":"Engineer","skill":"Crowd management","placeOfWork":"Bengaluru","eduDoc":"docid:"+PHOTO},
 "personal":{"fullNameAadhaar":"Test Srinivas","fatherOrHusband":"Test Venkatesh","maritalStatus":"Married","altMobile":"9876500002","residentialAddress":"12 Test Street, Bengaluru 560001"},
 "education":{"category":"Graduate","qualification":"B.E.","university":"Test University","year":"2007","specialization":"Computer Science"},
 "profession":{"status":"Employed","sector":"Private","category":"IT","role":"Engineer","years":"15"},
 "experience":{"volunteeredBefore":"Yes","times":"2","lastPeriods":"Jan 2025, Jun 2025","otherOrg":"Test Seva Samithi","details":"Queue management","languages":["Telugu","Kannada","English"],"ref1Name":"Test Ravi","ref1Mobile":"9876500003","ref2Name":"Test Uma","ref2Mobile":"9876500004"}})
group={"members":[member(n,"Groupmember",g,"01/01/19"+str(80+i),"Karnataka","Bengaluru Urban","Bengaluru","5600"+str(10+i),"98765"+str(10000+i)) for i,(n,g) in enumerate([("Leader","Male"),("Anil","Male"),("Bindu","Female"),("Charan","Male"),("Durga","Female"),("Eswar","Male")])],"current":0}
root={"schemaVersion":1,"profiles":profiles,"activeProfileId":profiles[0]["id"],"seva":seva,"group":group,
 "settings":{"defaultAction":"FILL","theme":"system","floatingButton":True,"autoAdvanceGroup":True,"backupReminderDays":14,"labs":False,"remoteConfigUrl":"","remotePublicKey":""},
 "meta":{"createdAt":"2026-10-24T00:00:00Z","updatedAt":"2026-10-24T00:00:00Z","lastBackupAt":None}}
json.dump({"format":"pilgrimhelper","v":1,"encrypted":False,"data":{"root":root,"docs":docs}},open("test-profiles.json","w"),indent=1)
for p in profiles:
    print(p["name"],len(p["persons"]),[ (x["name"],x["idNumber"],chk(x["idNumber"]) if x["idType"]=="AADHAAR" else "pp") for x in p["persons"]][:2])
