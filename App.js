//Imports
import React from 'react';
import {
  View,
  Text,
  Picker,
  StyleSheet,
  ImageBackground
} from 'react-native';

import NfcManager, { NfcEvents, Ndef } from 'react-native-nfc-manager';

import {
  Container,
  Content,
  Header,
  Form,
  Input,
  Item,
  Button,
  Label
} from 'native-base';

import * as firebase from 'firebase';
import { createStackNavigator } from 'react-navigation-stack';
import { createAppContainer } from 'react-navigation';

//Import API Keys
const firebaseConfig = require('./json/db_config.json');

//Initialise firebase connection
firebase.initializeApp(firebaseConfig);
//Common references
database = firebase.database();
config_ref = database.ref("/config");
users_ref = database.ref("/users");
log_ref = database.ref("/logs");


//Async fetch function
//Gets all the active tokens
async function get_active_tokens() {
  var tokens = [];
  var snapshot = await config_ref.child("/tokens").orderByChild("Active").equalTo(true).once('value');
  if(snapshot.exists()){
    tokens = Object.keys(snapshot.val());
    return tokens;
  }
  return [];
}

 //Async fetch function
 //Checks token is active in case user hasn't update selection
 async function check_token_active(token){
   //Check the token given is active
   //Might be incase someone has cached app and attempts to scan for inactive token
   var snapshot = await config_ref.child("/tokens").child("/"+token+"/Active").once('value');
   if(snapshot.exists()){
     return snapshot.val()
   }
   return false;
 }

 //Async fetch function
 //Checks if user has the token
 // Code: {2: User not found, 1: No token, 0: Has token}
 async function scan_token(token, hash){
   //Default code is 2 when no user is found
   //Possible NFC Tampering
   var code = 2;
   await users_ref.orderByChild("hash").equalTo(hash).once('value').then(
     function(super_snap){
       //Take parent snapshot
     if(super_snap.exists()){
       //Check it exists and contains children as a result
       user = super_snap.val()[0];
       if("tokens" in user){
         //Check tokens key is in the user
         if([token] in user["tokens"]){
           //Check the token exists, and if so, get it's value
           if(user["tokens"][token] ){
             //If the user has the token, code is 0 for valid scan
             set_token_as_used(token, hash);
             log_action({"Action": "Scanned Token", "Token": token, "Person": user["name"], "Success":true });
             code = 0;
           } else{
             //If the user doesn't have the token, code is 1 for token used
             log_action({"Action": "Scanned Token", "Token": token, "Person": user["name"], "Success":false, "Failure": "User does not have token" });
             code = 1;
           }
         }else{
           log_action({"Action": "Scanned Token", "Token": token, "Person": user["name"], "Success":false, "Failure": "Token doesn't exist" });
         }
       }
     }
   });
   return code;
 }


 //Sets the token for the user as used
 function set_token_as_used(token,hash){
    var target_user = (users_ref.orderByChild("hash").equalTo(hash));
    target_user.once("child_added", function(snapshot){
      snapshot.ref.child("tokens").update({ [token] : false});

    })
 }

 function log_action(log){
   log["Timestamp"] = new Date().toLocaleString();
   log_ref.push(log);
 }

 const token_scan_styles = StyleSheet.create(require("./json/token_scan_style.json"));

class TokenSelectionPage extends React.Component {
  constructor(props){
    super(props)
    this.state = ({
      tokens:[],
      scan_type: "",
      attendant: "",
      scan_success : ""
    })
  }

  componentDidMount() {
    NfcManager.start();
    try{
      NfcManager.setEventListener(NfcEvents.DiscoverTag, tag => {
          ndef_payload = Ndef.text.decodePayload(tag.ndefMessage[0].payload);
          this.setState({ attendant: ndef_payload });
          this.try_scan_token(this.state.scan_type, this.state.attendant);
        NfcManager.unregisterTagEvent().catch(() => 0);
      });
    }catch(error){
      alert(error);
    }

  }

  async componentWillMount(){
    const active_tokens = await get_active_tokens();
      this.setState({ tokens: active_tokens });
      if (active_tokens.length > 0) {
          this.setState({ scan_type: active_tokens[0] });
      }

  }

  componentWillUnmount(){
    NfcManager.setEventListener(NfcEvents.DiscoverTag, null);
    NfcManager.unregisterTagEvent().catch(() => 0);
  }

  _cancel = () => {
    NfcManager.unregisterTagEvent().catch(() => 0);
  }

  _test = async () => {
    try {
      await NfcManager.registerTagEvent();
    } catch (ex) {
      console.warn('ex', ex);
      NfcManager.unregisterTagEvent().catch(() => 0);
    }
  }

  async try_scan_token(token, person_hash){
    this.state.scan_success = "";
    doesExist = await check_token_active(token);
    if(doesExist){
      code = await scan_token(token, person_hash);
      if(code == 0){
        this.setState({scan_success:"Scan Successful!"});
      } else if(code==1){
        this.setState({scan_success:"TOKEN ALREADY USED"});
        alert("This token has already been scanned!");
      } else{
        this.setState({scan_success:"User doesn't exist, sent to help desk ASAP"});
        alert("This user doesn't exist! Seek assistance");
      }
    }else{
      this.setState({scan_success:"Inactive token, application restart required"});
      alert("Token is now inactive. Reloading page");
      componentWillMount();
    }
  }

  render() {
    var token_buttons = [];
    const { navigate } = this.props.navigation;
    for(item in this.state.tokens){
      token_buttons.push(<Picker.Item label = { this.state.tokens[item] } value = { this.state.tokens[item] } />)
    }
    return (
      <Container>
        <View>
	  <Item>
          <Text style = { { fontSize:20 } }>Selected Token: { this.state.scan_type }</Text>
          </Item>
          <Picker selectedValue = { this.state.scan_type } onValueChange={(value,_index)=> this.setState({scan_type:value})}>
            { token_buttons }
          </Picker>

          <View style = { token_scan_styles.centered_box }>
            <Button
              style = { token_scan_styles.scan_nfc_button }
              onPress={ this._test } >
              <Text style= { token_scan_styles.nfc_button_text }>Scan Wristband</Text>
            </Button>
            </View>
          <Item style = { token_scan_styles.last_scan_text }>
            <Text> Last Scanned Hash: { this.state.attendant }</Text>
          </Item>
          <Item style = { token_scan_styles.last_scan_text }>
            <Text> Last Scan Result: { this.state.scan_success }</Text>
          </Item>
        </View>
      </Container>
    )
  }
}



const login_page_styles = StyleSheet.create(require("./json/login_page_style"));

class LoginPage extends React.Component {
  constructor(props){
    super(props)
    this.state = ({
      email:'',
      password:''
    })
  }

// This function exists. Should have a config for 'signup mode'
// Probably need an admin user
  signUpUser = (email,password) => {
    try{
      if(this.state.password.length<6){
        alert("Passwords must be at least 6 characters in length");
        return;
      }
      firebase.auth().createUserWithEmailAndPassword(email, password);
    }
      catch(error){
        console.log(error.toString());
      }

  }

  loginUser = (email,password) => {
      const { navigate } = this.props.navigation;
      firebase.auth().signInWithEmailAndPassword(email,password)
      .then(
        function(user){
          log_action( { "Attempted Login":email, "Successful": true });
          navigate('Scan Tags');
        }
      ).catch(
        function(error){
          alert("Incorrect username or password");
          log_action( { "Attempted Login":email, "Successful": false, "Error":error });
        });

  }

  render() {
    return (
      <Container>
       <ImageBackground source={ require("./assets/login_page_background.jpg") } style={login_page_styles.image}>
       <Item>
       <Text style = { login_page_styles.title }>Event Scanner</Text>
       </Item>
        <Form>
          <Item>
          <Input
          onChangeText={(email) => this.setState({email})}
          placeholder="Email"
          placeholderTextColor='#ffffff'
          style = { login_page_styles.inputBox }
          autoCapitalize = "none"
          />
          </Item>
          <Item>
          <Input
          secureTextEntry={true}
          onChangeText={(password) => this.setState({password})}
          placeholder="Password"
          placeholderTextColor='#ffffff'
          style = { login_page_styles.inputBox }
          />
          </Item>
          <Button
            full
            rounded
            success
            onPress = {() => this.loginUser(this.state.email, this.state.password)}
            style = {{margin : 10}}
            >
          <Text> Login </Text>
          </Button>
        </Form>
        </ImageBackground>
      </Container>
      )
  }
}


const AppNavigator = createStackNavigator(
    {
        'Login': LoginPage,
        'Scan Tags': TokenSelectionPage,
    },
    {
        initialRouteName: "Login"
    }
);

const AppContainer = createAppContainer(AppNavigator);
export default class App extends React.Component {
  render(){
    return <AppContainer />;
  }
}
